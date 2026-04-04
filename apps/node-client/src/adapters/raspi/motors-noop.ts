import { EventEmitter } from 'events';
import type { Motors } from '../../interfaces/motors.js';

export class NoopMotors extends EventEmitter implements Motors {
  async move(_direction: string, _durationMs: number): Promise<void> {}
  stop(): void {}
}
