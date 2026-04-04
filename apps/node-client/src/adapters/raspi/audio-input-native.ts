import { EventEmitter } from 'events';
import * as os from 'node:os';
import { spawn, type ChildProcess } from 'node:child_process';
import { type Readable } from 'node:stream';
import { logger } from '../../common/logger.js';
import type { AudioInput } from '../../interfaces/audio-input.js';

function resolveBackend(): { bin: string; args: string[] } {
  const backend = (process.env.AUDIO_BACKEND || '').toLowerCase();
  const isWindows = os.platform() === 'win32';

  const useSox = backend === 'sox' || (!backend && isWindows);
  const useArecord = backend === 'arecord' || (!backend && !isWindows);

  if (useSox) {
    const bin = process.env.SOX_PATH || 'sox';
    return {
      bin,
      args: ['-t', 'waveaudio', 'default', '-t', 'raw', '-r', '16000', '-c', '1', '-b', '16', '-e', 'signed-integer', '-L', '-'],
    };
  }

  if (useArecord) {
    return {
      bin: 'arecord',
      args: ['-r', '16000', '-c', '1', '-f', 'S16_LE', '-t', 'raw'],
    };
  }

  return {
    bin: 'sox',
    args: ['-d', '-r', '16000', '-c', '1', '-b', '16', '-e', 'signed-integer', '-L', '-t', 'raw', '-'],
  };
}

export class NativeAudioInput extends EventEmitter implements AudioInput {
  private active = false;
  private proc: ChildProcess | null = null;

  async start(): Promise<void> {
    if (this.active) return;

    const { bin, args } = resolveBackend();
    logger.info('audio-input.start', { backend: bin });

    try {
      const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

      (proc.stdout as Readable).on('data', (data: Buffer) => {
        if (this.active) this.emit('data', data);
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg.includes('In:') || msg.includes('Out:') || msg === '') return;
        logger.error('audio-input.stderr', { backend: bin, message: msg });
      });

      proc.on('error', (err: Error) => {
        logger.error('audio-input.spawn-error', { backend: bin, message: err.message });
        this.active = false;
        this.emit('error', err);
      });

      proc.on('close', () => {
        this.active = false;
      });

      this.proc = proc;
      this.active = true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.warn('audio-input.unavailable', { message: error.message });
      this.active = false;
    }
  }

  async stop(): Promise<void> {
    if (!this.proc) return;
    this.active = false;
    this.proc.kill();
    this.proc = null;
    logger.info('audio-input.stop');
  }

  isActive(): boolean {
    return this.active;
  }
}
