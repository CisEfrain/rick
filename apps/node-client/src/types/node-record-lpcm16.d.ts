declare module 'node-record-lpcm16' {
  import { Readable } from 'node:stream';

  interface RecordOptions {
    sampleRate?: number;
    channels?: number;
    audioType?: string;
    encoding?: string;
    bitDepth?: number;
    endian?: string;
    recorder?: string;
    [key: string]: unknown;
  }

  interface RecordInstance {
    stream(): Readable;
    stop(): void;
  }

  function record(options?: RecordOptions): RecordInstance;

  export default { record };
}
