import { logger } from '../common/logger.js';
import { config } from '../config/appConfig.js';

export class DeepgramTTS {
  private sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  async synthesize(text: string): Promise<Buffer> {
    const params = new URLSearchParams({
      model: config.ttsModel,
      encoding: 'linear16',
      sample_rate: String(config.ttsSampleRate),
      container: 'none',
    });

    // aura-2 models require /v2/speak endpoint
    const version = config.ttsModel.startsWith('aura-2') ? 'v2' : 'v1';
    const url = `https://api.deepgram.com/${version}/speak?${params}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Token ${config.deepgramApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error(`TTS HTTP ${response.status}: ${response.statusText}`);
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
      // Return empty buffer on failure — pipeline continues without this sentence
      return Buffer.alloc(0);
    }
  }
}
