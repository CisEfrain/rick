import { createClient } from '@deepgram/sdk';
import { EventEmitter } from 'events';
import { logger } from '../common/logger.js';
import { config } from '../config/appConfig.js';

/**
 * Deepgram TTS con streaming via SDK.
 *
 * Usa deepgram.speak.live() — mismo patrón que deepgram.listen.live() del STT.
 * Mantiene un WebSocket abierto y envía texto + flush por oración.
 * Los chunks de audio llegan mientras Deepgram sintetiza.
 *
 * Eventos emitidos:
 *   "audio" (buffer: Buffer) — chunk de audio PCM listo para forwardear
 */
export class DeepgramTTS extends EventEmitter {
  private sessionId: string;
  private connection: any = null;
  private connected = false;
  private flushResolve: (() => void) | null = null;

  constructor(sessionId: string) {
    super();
    this.sessionId = sessionId;
  }

  connect(): void {
    if (this.connected) return;

    const deepgram = createClient(config.deepgramApiKey);

    this.connection = deepgram.speak.live({
      model: config.ttsModel,
      encoding: 'linear16',
      sample_rate: config.ttsSampleRate,
      container: 'none',
    });

    this.connection.on('open', () => {
      this.connected = true;
      logger.info('tts.connected', { sessionId: this.sessionId });
    });

    this.connection.on('audio', (data: any) => {
      // data puede ser un Buffer, ArrayBuffer, o un objeto con .data
      const buffer = Buffer.isBuffer(data)
        ? data
        : Buffer.from(data?.data ?? data);
      if (buffer.length > 0) {
        this.emit('audio', buffer);
      }
    });

    this.connection.on('flushed', () => {
      this.flushResolve?.();
      this.flushResolve = null;
    });

    this.connection.on('warning', (msg: any) => {
      logger.warn('tts.warning', { sessionId: this.sessionId, message: msg });
    });

    this.connection.on('error', (err: any) => {
      logger.error('tts.error', {
        sessionId: this.sessionId,
        message: err?.message || String(err),
      });
      // Resolve pending flush so the pipeline doesn't hang
      this.flushResolve?.();
      this.flushResolve = null;
    });

    this.connection.on('close', () => {
      this.connected = false;
      this.connection = null;
      this.flushResolve?.();
      this.flushResolve = null;
      logger.info('tts.disconnected', { sessionId: this.sessionId });
    });
  }

  /**
   * Enviar texto para sintetizar. Retorna cuando todo el audio
   * de esta oración fue recibido (flushed).
   * Los chunks de audio se emiten como eventos "audio" durante la espera.
   */
  async speak(text: string): Promise<void> {
    if (!this.connected) {
      this.connect();
      // Esperar a que el WS se abra
      await new Promise<void>((resolve, reject) => {
        const onOpen = () => { cleanup(); resolve(); };
        const onError = (err: any) => { cleanup(); reject(err); };
        const cleanup = () => {
          this.connection?.removeListener('open', onOpen);
          this.connection?.removeListener('error', onError);
        };
        if (this.connected) { resolve(); return; }
        this.connection?.on('open', onOpen);
        this.connection?.on('error', onError);
      });
    }

    return new Promise<void>((resolve) => {
      this.flushResolve = resolve;
      this.connection.sendText(text);
      this.connection.flush();
      logger.info('tts.speak', { sessionId: this.sessionId, textLength: text.length });
    });
  }

  close(): void {
    this.connected = false;
    this.flushResolve?.();
    this.flushResolve = null;
    try {
      this.connection?.requestClose();
    } catch { /* ignore */ }
    this.connection = null;
  }
}
