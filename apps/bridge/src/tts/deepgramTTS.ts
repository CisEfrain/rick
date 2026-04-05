import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../common/logger.js';
import { config } from '../config/appConfig.js';

/**
 * Deepgram TTS con WebSocket streaming.
 *
 * En vez de sintetizar cada oración completa con REST y esperar el buffer,
 * mantiene un WebSocket abierto y envía texto + Flush por oración.
 * Los chunks de audio llegan mientras Deepgram sintetiza → se forwardean
 * al cliente inmediatamente → menor latencia, especialmente en textos largos.
 *
 * Protocolo:
 *   → { type: "Speak", text: "..." }  enviar texto
 *   → { type: "Flush" }               pedir audio pendiente
 *   → { type: "Close" }               cerrar conexión
 *   ← binary                          chunk de audio PCM
 *   ← { type: "Flushed" }             todo el audio del flush fue enviado
 */
export class DeepgramTTS extends EventEmitter {
  private sessionId: string;
  private ws: WebSocket | null = null;
  private connected = false;
  private flushResolve: (() => void) | null = null;

  constructor(sessionId: string) {
    super();
    this.sessionId = sessionId;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    const params = new URLSearchParams({
      model: config.ttsModel,
      encoding: 'linear16',
      sample_rate: String(config.ttsSampleRate),
      container: 'none',
    });

    const url = `wss://api.deepgram.com/v1/speak?${params}`;

    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(url, {
        headers: { Authorization: `Token ${config.deepgramApiKey}` },
      });

      this.ws.on('open', () => {
        this.connected = true;
        logger.info('tts.ws.connected', { sessionId: this.sessionId });
        resolve();
      });

      this.ws.on('message', (data: WebSocket.Data, isBinary: boolean) => {
        if (isBinary) {
          this.emit('audio', Buffer.from(data as ArrayBuffer));
        } else {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'Flushed') {
              this.flushResolve?.();
              this.flushResolve = null;
            } else if (msg.type === 'Warning') {
              logger.warn('tts.ws.warning', { sessionId: this.sessionId, message: msg.warn_msg });
            }
          } catch { /* ignore */ }
        }
      });

      this.ws.on('error', (err: Error) => {
        logger.error('tts.ws.error', { sessionId: this.sessionId, message: err.message });
        if (!this.connected) reject(err);
      });

      this.ws.on('close', () => {
        this.connected = false;
        this.ws = null;
        // Resolve any pending flush so the pipeline doesn't hang
        this.flushResolve?.();
        this.flushResolve = null;
      });
    });
  }

  /**
   * Enviar texto para sintetizar. Retorna cuando todo el audio
   * de esta oración fue recibido (Flushed).
   * Los chunks de audio se emiten como eventos "audio" durante la espera.
   */
  async speak(text: string): Promise<void> {
    if (!this.ws || !this.connected) {
      await this.connect();
    }

    return new Promise<void>((resolve) => {
      this.flushResolve = resolve;
      this.ws!.send(JSON.stringify({ type: 'Speak', text }));
      this.ws!.send(JSON.stringify({ type: 'Flush' }));

      logger.info('tts.speak', { sessionId: this.sessionId, textLength: text.length });
    });
  }

  /**
   * Fallback REST para casos donde el WS no está disponible.
   * Retorna el buffer completo (sin streaming).
   */
  async synthesize(text: string): Promise<Buffer> {
    const params = new URLSearchParams({
      model: config.ttsModel,
      encoding: 'linear16',
      sample_rate: String(config.ttsSampleRate),
      container: 'none',
    });

    const isV2 = config.ttsModel.startsWith('aura-2');
    const version = isV2 ? 'v2' : 'v1';
    const url = `https://api.deepgram.com/${version}/speak?${params}`;
    const body = isV2
      ? JSON.stringify({ text, model: config.ttsModel })
      : JSON.stringify({ text });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `${isV2 ? 'Bearer' : 'Token'} ${config.deepgramApiKey}`,
          'Content-Type': 'application/json',
        },
        body,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`TTS HTTP ${response.status}: ${response.statusText} — ${errorBody}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (err: any) {
      logger.error('tts.error', { sessionId: this.sessionId, message: err.message, textLength: text.length });
      return Buffer.alloc(0);
    }
  }

  close(): void {
    if (this.ws) {
      try {
        if (this.connected) this.ws.send(JSON.stringify({ type: 'Close' }));
      } catch { /* ignore */ }
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.flushResolve?.();
    this.flushResolve = null;
  }
}
