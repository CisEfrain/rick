import type { Display } from '../../interfaces/display.js';
import type { FrontendWSServer } from './frontend-ws-server.js';

export class BrowserDisplay implements Display {
  constructor(private frontend: FrontendWSServer) {}

  async init(): Promise<void> {
    this.frontend.send({ type: 'oled', state: 'INIT' });
  }

  setState(state: string, extra?: string): void {
    this.frontend.send({ type: 'oled', state, extra });
  }

  notify(event: string, data?: Record<string, unknown>): void {
    this.frontend.send({ type: event, ...data });
  }

  async shutdown(): Promise<void> {
    this.frontend.send({ type: 'oled', state: 'OFF' });
  }
}
