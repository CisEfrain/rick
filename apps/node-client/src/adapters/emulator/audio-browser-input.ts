import { EventEmitter } from 'events';
import type { AudioInput } from '../../interfaces/audio-input.js';
import type { FrontendWSServer } from './frontend-ws-server.js';

export class BrowserAudioInput extends EventEmitter implements AudioInput {
  private active = false;

  constructor(private frontend: FrontendWSServer) {
    super();
    frontend.on('audio_from_browser', (buffer: Buffer) => {
      if (this.active) this.emit('data', buffer);
    });
  }

  async start(): Promise<void> {
    this.active = true;
    this.frontend.send({ type: 'mic_start' });
  }

  async stop(): Promise<void> {
    this.active = false;
    this.frontend.send({ type: 'mic_stop' });
  }

  isActive(): boolean {
    return this.active;
  }
}
