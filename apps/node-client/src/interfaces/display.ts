/**
 * Pantalla de Rick.
 * Pi: SH1106 128x64 por I2C con luma.oled.
 * Emulador: canvas en el browser.
 */
export interface Display {
  init(): Promise<void>;
  setState(state: string, extra?: string): void;
  notify(event: string, data?: Record<string, unknown>): void;
  shutdown(): Promise<void>;
}
