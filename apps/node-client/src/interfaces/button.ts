import { EventEmitter } from 'events';

/**
 * Botón push-to-talk (o activación por voz).
 * Pi: botón físico GPIO con pull-up.
 * Emulador: tecla Space o botón en el browser.
 *
 * Eventos:
 *   "press"   — botón presionado
 *   "release" — botón soltado
 */
export interface Button extends EventEmitter {
  init(): Promise<void>;
  destroy(): void;
}
