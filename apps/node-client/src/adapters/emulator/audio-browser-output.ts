import { EventEmitter } from 'events';
import type { AudioOutput } from '../../interfaces/audio-output.js';
import type { FrontendWSServer } from './frontend-ws-server.js';

export class BrowserAudioOutput extends EventEmitter implements AudioOutput {
  private _playing = false;

  constructor(private frontend: FrontendWSServer) {
    super();
    frontend.on('playback_done', () => {
      this._playing = false;
      this.emit('finished');
    });
  }

  enqueue(pcmBuffer: Buffer): void {
    if (!this._playing) {
      this._playing = true;
      this.emit('started');
    }
    this.frontend.sendBinary(pcmBuffer);
  }

  flush(): void {
    this.frontend.send({ type: 'playback_flush' });
  }

  stop(): void {
    this._playing = false;
    this.frontend.send({ type: 'playback_stop' });
  }

  isPlaying(): boolean {
    return this._playing;
  }
}
