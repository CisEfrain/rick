import { EventEmitter } from 'events';
import type { Button } from '../../interfaces/button.js';
import type { FrontendWSServer } from './frontend-ws-server.js';

export class BrowserButton extends EventEmitter implements Button {
  constructor(private frontend: FrontendWSServer) {
    super();
  }

  async init(): Promise<void> {
    this.frontend.on('ptt_press', () => this.emit('press'));
    this.frontend.on('ptt_release', () => this.emit('release'));
  }

  destroy(): void {
    this.frontend.removeAllListeners('ptt_press');
    this.frontend.removeAllListeners('ptt_release');
  }
}
