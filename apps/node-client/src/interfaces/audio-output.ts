import { EventEmitter } from 'events';

/**
 * Reproducción de audio por parlante.
 * Pi: aplay/sox reproduciendo PCM 16kHz 16-bit mono.
 * Emulador: browser reproduciendo audio vía Web Audio API.
 *
 * Eventos:
 *   "started"      — empezó a reproducir
 *   "finished"     — terminó de reproducir todo el audio
 *   "error" (err)  — error de reproducción
 */
export interface AudioOutput extends EventEmitter {
  enqueue(pcmBuffer: Buffer): void;
  flush(): void;
  stop(): void;
  isPlaying(): boolean;
}
