import { EventEmitter } from 'events';
import type { Motors } from '../../interfaces/motors.js';
import type { FrontendWSServer } from './frontend-ws-server.js';

export class BrowserMotors extends EventEmitter implements Motors {
  constructor(private frontend: FrontendWSServer) {
    super();
  }

  async move(direction: string, durationMs: number): Promise<void> {
    this.emit('started', direction, durationMs);
    this.frontend.send({ type: 'motor', direction, duration: durationMs });
    await new Promise<void>((resolve) => setTimeout(resolve, durationMs));
    this.emit('stopped');
  }

  stop(): void {
    this.frontend.send({ type: 'motor', direction: 'stop', duration: 0 });
    this.emit('stopped');
  }
}
