import { EventEmitter } from 'events';
import type { Button } from '../../interfaces/button.js';

export class NoopButton extends EventEmitter implements Button {
  async init(): Promise<void> {}
  destroy(): void {}
}
