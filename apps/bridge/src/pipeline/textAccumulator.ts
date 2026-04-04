import { EventEmitter } from 'node:events';

export interface TextAccumulatorEvents {
  sentence: [text: string];
}

const MIN_SENTENCE_LENGTH = 15;
const MAX_BUFFER_SOFT = 200;
const MAX_BUFFER_HARD = 250;

// Matches sentence-ending punctuation followed by a space (but not "1. " numbered lists)
const SENTENCE_END = /(?<!\d)[.!?]\s/;
const SEMICOLON_END = /;\s/;

export class TextAccumulator extends EventEmitter<TextAccumulatorEvents> {
  private buffer = '';

  addChunk(text: string): void {
    this.buffer += text;
    this.tryFlush();
  }

  flush(): void {
    const text = this.buffer.trim();
    this.buffer = '';
    if (text.length > 0) {
      this.emit('sentence', text);
    }
  }

  clear(): void {
    this.buffer = '';
  }

  private tryFlush(): void {
    // Try strong sentence terminators first
    const sentenceMatch = this.buffer.match(SENTENCE_END);
    if (sentenceMatch && sentenceMatch.index !== undefined) {
      const endIdx = sentenceMatch.index + 1; // include the punctuation
      const sentence = this.buffer.substring(0, endIdx).trim();
      this.buffer = this.buffer.substring(endIdx).trimStart();

      if (sentence.length >= MIN_SENTENCE_LENGTH) {
        this.emit('sentence', sentence);
        // Recurse in case there are more sentences in the remaining buffer
        if (this.buffer.length > 0) this.tryFlush();
        return;
      }
      // Sentence too short — put it back and wait for more text
      this.buffer = sentence + ' ' + this.buffer;
      return;
    }

    // Try semicolon
    const semiMatch = this.buffer.match(SEMICOLON_END);
    if (semiMatch && semiMatch.index !== undefined && this.buffer.length >= MIN_SENTENCE_LENGTH) {
      const endIdx = semiMatch.index + 1;
      const sentence = this.buffer.substring(0, endIdx).trim();
      this.buffer = this.buffer.substring(endIdx).trimStart();
      if (sentence.length >= MIN_SENTENCE_LENGTH) {
        this.emit('sentence', sentence);
        if (this.buffer.length > 0) this.tryFlush();
        return;
      }
      this.buffer = sentence + ' ' + this.buffer;
      return;
    }

    // Soft limit: flush at next comma or word boundary
    if (this.buffer.length > MAX_BUFFER_SOFT) {
      const commaIdx = this.buffer.indexOf(', ', MIN_SENTENCE_LENGTH);
      if (commaIdx !== -1) {
        const sentence = this.buffer.substring(0, commaIdx + 1).trim();
        this.buffer = this.buffer.substring(commaIdx + 2).trimStart();
        this.emit('sentence', sentence);
        return;
      }
    }

    // Hard limit: force flush at word boundary
    if (this.buffer.length > MAX_BUFFER_HARD) {
      const spaceIdx = this.buffer.lastIndexOf(' ', MAX_BUFFER_HARD);
      const breakIdx = spaceIdx > MIN_SENTENCE_LENGTH ? spaceIdx : MAX_BUFFER_HARD;
      const sentence = this.buffer.substring(0, breakIdx).trim();
      this.buffer = this.buffer.substring(breakIdx).trimStart();
      if (sentence.length > 0) {
        this.emit('sentence', sentence);
      }
    }
  }
}
