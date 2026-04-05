import { ReconnectingWebSocket } from './common/retry.js';
import { logger } from './common/logger.js';
import type { AudioInput } from './interfaces/audio-input.js';
import type { AudioOutput } from './interfaces/audio-output.js';
import type { Display } from './interfaces/display.js';
import type { Motors } from './interfaces/motors.js';
import type { Button } from './interfaces/button.js';
import type { Telemetry } from './interfaces/telemetry.js';
import * as readline from 'node:readline';

export interface ClientConfig {
  bridgeWsUrl: string;
  sessionId: string;
  token: string;
  muteMicWhileSpeaking: boolean;
  playbackDoneDelayMs: number;
  pttMode: boolean;
}

export class RickClient {
  private ws!: ReconnectingWebSocket;
  private rl!: readline.Interface;
  private state = 'IDLE';

  constructor(
    private audioIn: AudioInput,
    private audioOut: AudioOutput,
    private display: Display,
    private motors: Motors,
    private button: Button,
    private telemetry: Telemetry,
    private config: ClientConfig,
  ) {}

  async start(): Promise<void> {
    await this.display.init();
    await this.button.init();

    const wsUrl = `${this.config.bridgeWsUrl}?sessionId=${this.config.sessionId}&token=${this.config.token}`;

    this.ws = new ReconnectingWebSocket({
      url: wsUrl,
      onOpen: () => {
        logger.info('client.connected', { sessionId: this.config.sessionId });
        this.setState('IDLE');
        this.display.notify('log', { level: 'success', src: 'WS', msg: 'Conectado al Bridge' });
      },
      onMessage: (data, isBinary) => this.handleBridgeMessage(data, isBinary),
      onClose: () => {
        logger.info('client.disconnected', { sessionId: this.config.sessionId });
        this.display.notify('log', { level: 'warn', src: 'WS', msg: 'Desconectado del Bridge' });
      },
      onError: () => {
        this.display.notify('log', { level: 'error', src: 'WS', msg: 'Error de conexión al Bridge' });
      },
    });

    // Audio del micrófono → Bridge
    this.audioIn.on('data', (chunk: Buffer) => {
      try {
        this.ws.send(chunk);
      } catch { /* ignore */ }
    });

    // Reproducción terminó → reactivar micrófono
    this.audioOut.on('finished', () => {
      logger.info('audioOut.finished', { state: this.state });
      if (this.config.pttMode) {
        this.audioIn.start().catch(() => {});
        this.setState('IDLE');
      } else if (this.config.muteMicWhileSpeaking) {
        setTimeout(async () => {
          if (!this.audioOut.isPlaying()) {
            await this.audioIn.start();
            this.setState('IDLE');
          }
        }, this.config.playbackDoneDelayMs);
      } else {
        this.setState('IDLE');
      }
    });

    // PTT: botón controla inicio/fin de captura
    this.button.on('press', async () => {
      logger.info('button.press', { state: this.state, pttMode: this.config.pttMode });
      if (this.config.pttMode && this.state === 'IDLE') {
        await this.audioIn.start();
        this.setState('LISTENING');
        this.display.notify('log', { level: 'info', src: 'MIC', msg: 'Captura de audio iniciada (PTT)' });
      }
    });

    this.button.on('release', async () => {
      if (this.config.pttMode && this.audioIn.isActive()) {
        logger.info('button.release', { message: 'Delaying mic stop 1.5s for utterance detection' });
        setTimeout(async () => {
          await this.audioIn.stop();
          this.display.notify('log', { level: 'info', src: 'MIC', msg: 'Captura detenida' });
          // Si Deepgram no detectó utterance, volver a IDLE
          if (this.state === 'LISTENING') {
            this.setState('IDLE');
          }
        }, 1500);
      }
    });

    this.setupCLI();
    this.ws.connect();

    // Solo auto-iniciar mic en modo continuo (no PTT)
    if (!this.config.pttMode) {
      await this.audioIn.start();
    }

    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║    Rick Voice Agent Client — Live Streaming      ║');
    console.log('╠══════════════════════════════════════════════════╣');
    if (this.config.pttMode) {
      console.log('║  Push-to-Talk: presioná Space para hablar        ║');
    } else {
      console.log('║  Mic is OPEN and sending to Deepgram 24/7        ║');
      console.log('║  Deepgram VAD will auto-detect when you speak    ║');
    }
    console.log('║  !stop              →  Interrupt current audio   ║');
    console.log('║  !quit / Ctrl+C     →  Exit                     ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');

    this.startTelemetryLoop();
  }

  private handleBridgeMessage(data: import('ws').Data, isBinary: boolean): void {
    if (isBinary) {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      this.audioOut.enqueue(buffer);
      return;
    }

    try {
      const msg = JSON.parse(data.toString()) as Record<string, unknown>;

      if (msg.type === 'audio.start') {
        if (!this.audioOut.isPlaying()) {
          console.log('\n\x1b[36m🔊 [Rick está hablando...]\x1b[0m');
        }
        if (this.config.muteMicWhileSpeaking) {
          this.audioIn.stop().catch(() => {});
        }
        this.setState('SPEAKING');
        this.display.notify('speaking_start', {});
        this.display.notify('log', { level: 'info', src: 'TTS', msg: 'Rick está hablando...' });
      }

      if (msg.type === 'audio.end') {
        logger.info('audio.end.received', { state: this.state });
        this.audioOut.flush();
        this.display.notify('speaking_done', {});

        // Safety: si playback_done nunca llega del browser, forzar IDLE después de 10s
        setTimeout(() => {
          if (this.state === 'SPEAKING') {
            logger.warn('audio.playback_timeout', { message: 'Forcing state to IDLE after timeout' });
            this.audioIn.start().catch(() => {});
            this.setState('IDLE');
          }
        }, 10000);
      }

      if (msg.type === 'motor_command') {
        const direction = msg.direction as string;
        const duration = msg.duration as number;
        this.motors.move(direction, duration).catch(() => {});
        this.display.notify('log', { level: 'info', src: 'MOTOR', msg: `${direction} (${duration}ms)` });
      }

      if (msg.type === 'transcript') {
        const text = msg.text as string | undefined;
        this.display.setState('LISTENING', text?.slice(0, 21));
        this.display.notify('transcript', { text: msg.text });
      }

      if (msg.type === 'utterance') {
        this.display.notify('message', { role: 'user', text: msg.text });
        this.display.notify('log', { level: 'info', src: 'STT', msg: `"${msg.text}"` });
      }

      if (msg.type === 'response_text') {
        this.display.notify('message', { role: 'rick', text: msg.text, latency: msg.latency });
      }

      if (msg.type === 'tool_call') {
        this.display.notify('log', { level: 'info', src: 'TOOL', msg: `${msg.name}(${JSON.stringify(msg.args)})` });
      }

      if (msg.type === 'tool_result') {
        this.display.notify('log', { level: 'success', src: 'TOOL', msg: `→ ${JSON.stringify(msg.result)}` });
      }

      if (msg.type === 'error') {
        this.setState('ERROR');
        this.display.notify('log', { level: 'error', src: 'BRIDGE', msg: msg.message as string });
      }
    } catch {
      // ignore malformed JSON
    }
  }

  private setState(state: string, extra?: string): void {
    this.state = state;
    this.display.setState(state, extra);
  }

  private setupCLI(): void {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '',
    });

    this.rl.on('line', (line) => {
      const input = line.trim();
      if (!input) return;

      if (input === '!quit') {
        this.stop().then(() => process.exit(0));
        return;
      }

      if (input === '!stop') {
        this.audioOut.stop();
        try {
          this.ws.sendJson({ type: 'stop' });
        } catch { /* ignore */ }
        console.log('⏹ Interrupted playback');
        return;
      }

      console.log(`Unknown command: ${input}`);
    });
  }

  private startTelemetryLoop(): void {
    setInterval(async () => {
      try {
        const data = await this.telemetry.read();
        this.ws.sendJson({ type: 'telemetry', ...data });
      } catch { /* ignore */ }
    }, 10000);
  }

  async stop(): Promise<void> {
    logger.info('client.shutdown', { sessionId: this.config.sessionId });
    await this.audioIn.stop();
    this.audioOut.stop();
    await this.display.shutdown();
    this.motors.stop();
    this.button.destroy();
    this.ws.close();
    this.rl?.close();
  }
}
