import { EventEmitter } from 'events';
import * as os from 'node:os';
import { spawn, type ChildProcess } from 'node:child_process';
import { logger } from '../../common/logger.js';
import type { AudioOutput } from '../../interfaces/audio-output.js';

const DRAIN_DELAY_MS = parseInt(process.env.AUDIO_DRAIN_DELAY_MS || '800', 10);

export class NativeAudioOutput extends EventEmitter implements AudioOutput {
  private proc: ChildProcess | null = null;
  private _isPlaying = false;
  private drainTimer: ReturnType<typeof setTimeout> | null = null;

  private spawnPlayer(): ChildProcess {
    const isWindows = os.platform() === 'win32';
    if (isWindows) {
      const soxPath = process.env.SOX_PATH || 'sox';
      return spawn(soxPath, [
        '-t', 'raw', '-r', '16000', '-c', '1', '-b', '16', '-e', 'signed-integer', '-L', '-',
        '-t', 'waveaudio', 'default',
      ], { stdio: ['pipe', 'ignore', 'ignore'] });
    }
    return spawn('aplay', ['-r', '16000', '-c', '1', '-f', 'S16_LE', '-t', 'raw'], {
      stdio: ['pipe', 'ignore', 'ignore'],
    });
  }

  enqueue(pcmBuffer: Buffer): void {
    if (this.drainTimer) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }

    if (!this.proc) {
      this.proc = this.spawnPlayer();
      this.proc.on('error', (err) => {
        logger.error('audio-output.spawn-error', { message: err.message });
        this.emit('error', err);
      });
      this.proc.stdin?.on('error', () => {});
      this._isPlaying = true;
      this.emit('started');
      logger.info('audio-output.started');
    }

    if (this.proc.stdin?.writable) {
      this.proc.stdin.write(pcmBuffer);
    }
  }

  flush(): void {
    if (!this.proc) return;

    this.drainTimer = setTimeout(() => {
      this.drainTimer = null;
      if (!this.proc) return;
      const proc = this.proc;
      this.proc = null;
      this._isPlaying = false;
      try { proc.stdin?.end(); } catch { /* ignore */ }
      proc.on('close', () => { /* natural exit */ });
      setTimeout(() => {
        try { proc.kill(); } catch { /* ignore */ }
      }, 15000);
      logger.info('audio-output.finished');
      this.emit('finished');
    }, DRAIN_DELAY_MS);
  }

  stop(): void {
    if (this.drainTimer) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }
    if (!this.proc) return;
    try {
      this.proc.stdin?.end();
      this.proc.kill();
    } catch { /* ignore */ }
    this.proc = null;
    this._isPlaying = false;
    logger.info('audio-output.interrupted');
  }

  isPlaying(): boolean {
    return this._isPlaying;
  }
}
