import type { Display } from '../../interfaces/display.js';

export class NoopDisplay implements Display {
  async init(): Promise<void> {}
  setState(_state: string, _extra?: string): void {}
  notify(_event: string, _data?: Record<string, unknown>): void {}
  async shutdown(): Promise<void> {}
}
