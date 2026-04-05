import { createClient, LiveTTSEvents } from '@deepgram/sdk';
import { EventEmitter } from 'node:events';
import { logger } from '../common/logger.js';
import { config } from '../config/appConfig.js';

/**
 * Deepgram TTS via WebSocket streaming.
 *
 * Usa speak.live() para recibir audio en chunks a medida que se sintetiza,
 * en lugar de esperar la respuesta completa como con REST.
 *
 * Eventos emitidos:
 *   "audio" (buffer: Buffer) — chunk de audio PCM (puede haber multiples por oracion)
 *   "flushed" () — Deepgram termino de sintetizar el texto enviado
 *   "open" () — WebSocket TTS conectado
 *   "close" () — WebSocket TTS cerrado
 */

export interface DeepgramTTSEvents {
  audio: [buffer: Buffer];
  flushed: [];
  open: [];
  close: [];
  error: [error: Error];
}

const FLUSH_TIMEOUT_MS = 10_000;

export class DeepgramTTS extends EventEmitter<DeepgramTTSEvents> {
  private sessionId: string;
  private deepgram;
  private connection: any = null;
  private connected = false;
  private flushResolve: (() => void) | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(sessionId: string) {
    super();
    this.sessionId = sessionId;
    this.deepgram = createClient(config.deepgramApiKey);
  }

  connect(): void {
    if (this.connected) return;

    logger.info('tts.connecting', { sessionId: this.sessionId });

    this.connection = this.deepgram.speak.live({
      model: config.ttsModel,
      encoding: 'linear16',
      sample_rate: config.ttsSampleRate,
    });

    this.connection.on(LiveTTSEvents.Open, () => {
      logger.info('tts.connected', { sessionId: this.sessionId });
      this.connected = true;
      this.emit('open');
    });

    this.connection.on(LiveTTSEvents.Audio, (data: Buffer) => {
      if (data.length > 0) {
        this.emit('audio', Buffer.from(data));
      }
    });

    this.connection.on(LiveTTSEvents.Flushed, () => {
      logger.debug('tts.flushed', { sessionId: this.sessionId });
      this.resolvePendingFlush();
      this.emit('flushed');
    });

    this.connection.on(LiveTTSEvents.Error, (err: any) => {
      logger.error('tts.error', {
        sessionId: this.sessionId,
        message: err?.message || String(err),
      });
      this.resolvePendingFlush(); // unblock queue on error
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    });

    this.connection.on(LiveTTSEvents.Close, () => {
      logger.info('tts.disconnected', { sessionId: this.sessionId });
      this.connected = false;
      this.connection = null;
      this.resolvePendingFlush(); // unblock queue on close
      this.emit('close');
    });
  }

  sendText(text: string): void {
    if (!this.connected || !this.connection) {
      logger.warn('tts.send_text_not_connected', { sessionId: this.sessionId });
      return;
    }
    this.connection.sendText(text);
    logger.info('tts.send_text', { sessionId: this.sessionId, textLength: text.length });
  }

  /**
   * Flush: pide a Deepgram que termine de sintetizar el texto enviado.
   * Retorna una Promise que resuelve cuando llega el evento Flushed
   * (o timeout despues de 10s).
   */
  flush(): Promise<void> {
    if (!this.connected || !this.connection) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.flushResolve = resolve;
      this.flushTimer = setTimeout(() => {
        logger.warn('tts.flush_timeout', { sessionId: this.sessionId });
        this.resolvePendingFlush();
      }, FLUSH_TIMEOUT_MS);

      this.connection.flush();
    });
  }

  /** Descarta el buffer del server (para barge-in / interrupciones) */
  clear(): void {
    if (!this.connected || !this.connection) return;
    this.connection.clear();
    this.resolvePendingFlush();
    logger.info('tts.clear', { sessionId: this.sessionId });
  }

  close(): void {
    this.resolvePendingFlush();
    this.connected = false;
    try {
      this.connection?.requestClose();
    } catch {
      /* ignore */
    }
    this.connection = null;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  private resolvePendingFlush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.flushResolve) {
      this.flushResolve();
      this.flushResolve = null;
    }
  }
}
