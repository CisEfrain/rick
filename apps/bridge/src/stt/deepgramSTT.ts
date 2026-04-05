import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { EventEmitter } from 'node:events';
import { logger } from '../common/logger.js';
import { config } from '../config/appConfig.js';

export interface DeepgramSTTEvents {
  ready: [];
  partial: [transcript: string];
  utterance: [transcript: string];
  error: [error: Error];
  close: [];
}

export class DeepgramSTT extends EventEmitter<DeepgramSTTEvents> {
  private sessionId: string;
  private connection: any = null;
  private transcript = '';
  private connected = false;

  constructor(sessionId: string) {
    super();
    this.sessionId = sessionId;
  }

  connect(): void {
    if (this.connected) return;

    logger.info('stt.connecting', { sessionId: this.sessionId });

    const deepgram = createClient(config.deepgramApiKey);

    this.connection = deepgram.listen.live({
      model: config.sttModel,
      language: config.sttLanguage,
      encoding: 'linear16',
      sample_rate: 16000,
      channels: 1,
      interim_results: true,
      utterance_end_ms: config.sttUtteranceEndMs,
      vad_events: true,
      smart_format: true,
      punctuate: true,
    });

    this.connection.on(LiveTranscriptionEvents.Open, () => {
      logger.info('stt.connected', { sessionId: this.sessionId });
      this.connected = true;
      this.transcript = '';
      this.emit('ready');
    });

    this.connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
      const alt = data.channel?.alternatives?.[0];
      const text = alt?.transcript || '';

      if (data.is_final && text) {
        // Accumulate final transcript segments until UtteranceEnd
        this.transcript += (this.transcript ? ' ' : '') + text;
        this.emit('partial', this.transcript);
      }
    });

    this.connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
      const finalText = this.transcript.trim();
      this.transcript = '';

      if (finalText.length < 2) {
        // Skip empty/noise transcripts
        return;
      }

      logger.info('stt.utterance', { sessionId: this.sessionId, text: finalText });
      this.emit('utterance', finalText);
    });

    this.connection.on(LiveTranscriptionEvents.Error, (err: any) => {
      logger.error('stt.error', {
        sessionId: this.sessionId,
        message: err?.message || String(err),
      });
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    });

    this.connection.on(LiveTranscriptionEvents.Close, () => {
      logger.info('stt.disconnected', { sessionId: this.sessionId });
      this.connected = false;
      this.connection = null;
      this.emit('close');
    });
  }

  sendAudio(buffer: Buffer): void {
    if (!this.connected || !this.connection) return;
    this.connection.send(buffer);
  }

  disconnect(): void {
    this.connected = false;
    this.transcript = '';
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
}
