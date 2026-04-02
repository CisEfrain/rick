import * as os from 'node:os';
import { spawn, type ChildProcess } from 'node:child_process';
import { logger } from '../common/logger.js';
import type { ReconnectingWebSocket } from '../common/retry.js';

interface AudioStream {
  utteranceId: string;
  correlationId: string;
  chunkIndex: number;
  proc: ChildProcess;
}

const DRAIN_DELAY_MS = parseInt(process.env.AUDIO_DRAIN_DELAY_MS || '800', 10);

export class AudioPlayer {
  private currentStream: AudioStream | null = null;
  private ws: ReconnectingWebSocket | null = null;
  private _isPlaying = false;
  private sessionId: string;
  private drainTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  private spawnPlayer(): ChildProcess {
    const isWindows = os.platform() === 'win32';
    if (isWindows) {
      const soxPath = process.env.SOX_PATH || 'sox';
      return spawn(soxPath, ['-t', 'raw', '-r', '16000', '-c', '1', '-b', '16', '-e', 'signed-integer', '-L', '-', '-t', 'waveaudio', 'default'], { stdio: ['pipe', 'ignore', 'ignore'] });
    }
    return spawn('aplay', ['-r', '16000', '-c', '1', '-f', 'S16_LE', '-t', 'raw'], { stdio: ['pipe', 'ignore', 'ignore'] });
  }

  setWs(ws: ReconnectingWebSocket): void {
    this.ws = ws;
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get currentUtteranceId(): string | null {
    return this.currentStream?.utteranceId || null;
  }

  onAudioStart(utteranceId: string, correlationId: string, chunkIndex: number): void {
    // Cancel pending drain — a new utterance continues on the same aplay process
    if (this.drainTimer) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }
    if (this.currentStream) return; // already started by first chunk
    this._startStream(utteranceId, correlationId, chunkIndex);
  }

  private _startStream(utteranceId: string, correlationId: string, chunkIndex: number): void {
    this.finalizeCurrent();

    const proc = this.spawnPlayer();
    proc.on('error', (err) => {
      logger.error('player.spawn.error', { sessionId: this.sessionId, message: err.message });
    });
    // Suppress EPIPE — happens when process exits while chunks are still buffered
    proc.stdin?.on('error', () => {});

    this.currentStream = { utteranceId, correlationId, chunkIndex, proc };
    this._isPlaying = true;

    logger.info('player.start', { sessionId: this.sessionId, utteranceId, correlationId, chunkIndex });
  }

  onAudioChunk(buffer: Buffer): void {
    if (!this.currentStream) {
      // Auto-start stream on first chunk (audio arrives before audio.start event)
      this._startStream('utt-agent', 'corr-agent', 0);
    }
    if (this.currentStream!.proc.stdin?.writable) {
      this.currentStream!.proc.stdin.write(buffer);
    }
  }

  onAudioEnd(utteranceId: string, correlationId: string, chunkIndex: number): void {
    if (!this.currentStream) return;

    logger.info('player.utterance_done', { sessionId: this.sessionId, utteranceId, correlationId, chunkIndex });

    // Delay closing the player — if another utterance arrives quickly, we reuse the same process
    this.drainTimer = setTimeout(() => {
      this.drainTimer = null;
      if (!this.currentStream) return;
      logger.info('player.completed', { sessionId: this.sessionId, utteranceId, correlationId, chunkIndex });
      const proc = this.currentStream.proc;
      this.currentStream = null;
      this._isPlaying = false;
      try { proc.stdin?.end(); } catch { /* ignore */ }
      proc.on('close', () => { /* natural exit after drain */ });
      setTimeout(() => {
        try { proc.kill(); } catch { /* ignore */ }
      }, 15000);
    }, DRAIN_DELAY_MS);
  }

  onAudioError(utteranceId: string, correlationId: string, chunkIndex: number, message: string): void {
    logger.error('player.error', { sessionId: this.sessionId, utteranceId, correlationId, chunkIndex, message });
    this.finalizeCurrent();
  }

  onQueueCleared(utteranceId: string, reason: string): void {
    logger.info('player.queue_cleared', { sessionId: this.sessionId, utteranceId, message: reason });
    this.finalizeCurrent();
  }

  interrupt(): void {
    if (!this.currentStream) return;
    logger.info('player.interrupted', { sessionId: this.sessionId, utteranceId: this.currentStream.utteranceId });
    this.finalizeCurrent();
  }

  private finalizeCurrent(): void {
    if (!this.currentStream) return;
    try {
      this.currentStream.proc.stdin?.end();
      this.currentStream.proc.kill();
    } catch {
      // ignore
    }
    this.currentStream = null;
    this._isPlaying = false;
  }

  cleanup(): void {
    this.finalizeCurrent();
  }
}
