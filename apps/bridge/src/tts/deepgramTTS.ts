import { createClient } from '@deepgram/sdk';
import { EventEmitter } from 'events';
import { logger } from '../common/logger.js';
import { config } from '../config/appConfig.js';

/**
 * Deepgram TTS via SDK REST.
 *
 * Usa deepgram.speak.request() que maneja auth y endpoints automáticamente.
 * Sintetiza oración por oración — el pipeline ya envía cada oración
 * al cliente apenas está lista (no espera la respuesta completa).
 *
 * Eventos emitidos:
 *   "audio" (buffer: Buffer) — audio PCM completo de una oración
 */
export class DeepgramTTS extends EventEmitter {
  private sessionId: string;
  private deepgram;

  constructor(sessionId: string) {
    super();
    this.sessionId = sessionId;
    this.deepgram = createClient(config.deepgramApiKey);
  }

  async speak(text: string): Promise<void> {
    try {
      const response = await this.deepgram.speak.request(
        { text },
        {
          model: config.ttsModel,
          encoding: 'linear16',
          sample_rate: config.ttsSampleRate,
          container: 'none',
        },
      );

      const stream = await response.getStream();
      if (!stream) {
        logger.error('tts.no_stream', { sessionId: this.sessionId, textLength: text.length });
        return;
      }

      // Leer el stream y emitir como buffer
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
      const merged = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }

      const buffer = Buffer.from(merged.buffer, merged.byteOffset, merged.byteLength);

      if (buffer.length > 0) {
        this.emit('audio', buffer);
        logger.info('tts.synthesized', {
          sessionId: this.sessionId,
          textLength: text.length,
          audioBytes: buffer.length,
        });
      }
    } catch (err: any) {
      logger.error('tts.error', {
        sessionId: this.sessionId,
        message: err?.message || String(err),
        textLength: text.length,
      });
    }
  }

  close(): void {
    // Noop — REST no mantiene conexión
  }
}
