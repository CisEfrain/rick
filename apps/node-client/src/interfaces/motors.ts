import { EventEmitter } from 'events';

/**
 * Motores de tracción diferencial.
 * Pi: GPIO → Driver L298N → Motores TT.
 * Emulador: visualización 2D en el browser.
 *
 * Eventos:
 *   "started" (direction, duration) — movimiento iniciado
 *   "stopped"                       — movimiento terminado
 */
export interface Motors extends EventEmitter {
  move(direction: string, durationMs: number): Promise<void>;
  stop(): void;
}
