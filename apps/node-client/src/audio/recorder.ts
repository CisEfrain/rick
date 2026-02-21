import { logger } from '../common/logger.js';
import * as os from 'node:os';
import { spawn, type ChildProcess } from 'node:child_process';
import { Readable } from 'node:stream';

/**
 * Builds the spawn command + args for the audio backend.
 * Priority: AUDIO_BACKEND env var → auto-detect by OS platform.
 * - Windows → sox (requires SOX_PATH env var pointing to sox.exe)
 * - Linux   → arecord (ALSA, built-in on Raspberry Pi)
 */
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

  // Fallback to sox
  return {
    bin: 'sox',
    args: ['-d', '-r', '16000', '-c', '1', '-b', '16', '-e', 'signed-integer', '-L', '-t', 'raw', '-'],
  };
}

export interface RecorderOptions {
  sessionId: string;
  onAudioData: (chunk: Buffer) => void;
}

export class Recorder {
  private sessionId: string;
  private onAudioData: (chunk: Buffer) => void;
  private recording = false;
  private _process: ChildProcess | null = null;

  constructor(opts: RecorderOptions) {
    this.sessionId = opts.sessionId;
    this.onAudioData = opts.onAudioData;
  }

  get isRecording(): boolean {
    return this.recording;
  }

  startRecording(): void {
    if (this.recording) {
      logger.warn('recorder.already_recording', { sessionId: this.sessionId });
      return;
    }

    const { bin, args } = resolveBackend();
    logger.info('recorder.started', { sessionId: this.sessionId, backend: bin, args });

    try {
      const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

      (proc.stdout as Readable).on('data', (data: Buffer) => {
        if (this.recording) {
          this.onAudioData(data);
        }
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        // Ignore SoX progress lines (In:/Out: counters) — they are not errors
        if (msg.includes('In:') || msg.includes('Out:') || msg === '') return;
        logger.error('recorder.stream.error', {
          sessionId: this.sessionId,
          backend: bin,
          message: msg,
        });
      });

      proc.on('error', (err: Error) => {
        logger.error('recorder.spawn.error', {
          sessionId: this.sessionId,
          backend: bin,
          message: err.message,
          stack: err.stack,
        });
        this.recording = false;
      });

      proc.on('close', (code) => {
        if (this.recording) {
          logger.warn('recorder.process.closed', { sessionId: this.sessionId, backend: bin, code });
          this.recording = false;
        }
      });

      this._process = proc;
      this.recording = true;

    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.warn('recorder.mic.unavailable', {
        sessionId: this.sessionId,
        backend: bin,
        message: `Mic not available: ${error.message}.`
      });
      this.recording = false;
    }
  }

  stopRecording(): void {
    if (!this._process) return;

    this.recording = false;
    this._process.kill();
    this._process = null;

    logger.info('recorder.stopped', { sessionId: this.sessionId });
  }
}
