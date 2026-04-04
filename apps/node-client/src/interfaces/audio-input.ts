import { EventEmitter } from 'events';

/**
 * Captura de audio del micrófono.
 * Pi: arecord/sox capturando PCM 16kHz 16-bit mono.
 * Emulador: micrófono del browser enviando PCM por WebSocket.
 *
 * Eventos:
 *   "data" (buffer: Buffer) — chunk de audio PCM
 *   "error" (err: Error)    — error de captura
 */
export interface AudioInput extends EventEmitter {
  start(): Promise<void>;
  stop(): Promise<void>;
  isActive(): boolean;
}
