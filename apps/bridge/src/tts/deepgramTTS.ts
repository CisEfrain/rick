import { logger } from '../common/logger.js';
import { config } from '../config/appConfig.js';

export class DeepgramTTS {
  private sessionId: string;
  private isV2: boolean;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.isV2 = config.ttsModel.startsWith('aura-2');
  }

  async synthesize(text: string): Promise<Buffer> {
    let url: string;
    let body: string;

    if (this.isV2) {
      // v2/speak: model in body, encoding/sample_rate as query params
      const params = new URLSearchParams({
        encoding: 'linear16',
        sample_rate: String(config.ttsSampleRate),
        container: 'none',
      });
      url = `https://api.deepgram.com/v2/speak?${params}`;
      body = JSON.stringify({ text, model: config.ttsModel });
    } else {
      // v1/speak: model as query param
      const params = new URLSearchParams({
        model: config.ttsModel,
        encoding: 'linear16',
        sample_rate: String(config.ttsSampleRate),
        container: 'none',
      });
      url = `https://api.deepgram.com/v1/speak?${params}`;
      body = JSON.stringify({ text });
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Token ${config.deepgramApiKey}`,
          'Content-Type': 'application/json',
        },
        body,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`TTS HTTP ${response.status}: ${response.statusText} — ${errorBody}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      logger.info('tts.synthesized', {
        sessionId: this.sessionId,
        textLength: text.length,
        audioBytes: buffer.length,
      });

      return buffer;
    } catch (err: any) {
      logger.error('tts.error', {
        sessionId: this.sessionId,
        message: err.message,
        textLength: text.length,
      });
      return Buffer.alloc(0);
    }
  }
}
