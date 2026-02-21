import WebSocket from 'ws';
import { logger } from './logger.js';

interface RetryOptions {
  url: string;
  initialDelayMs?: number;
  maxDelayMs?: number;
  maxRetries?: number;
  onOpen?: () => void;
  onMessage?: (data: WebSocket.Data, isBinary: boolean) => void;
  onClose?: (code: number, reason: Buffer) => void;
  onError?: (err: Error) => void;
}

export class ReconnectingWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private initialDelayMs: number;
  private maxDelayMs: number;
  private maxRetries: number;
  private retryCount = 0;
  private closed = false;
  private onOpen?: () => void;
  private onMessage?: (data: WebSocket.Data, isBinary: boolean) => void;
  private onClose?: (code: number, reason: Buffer) => void;
  private onError?: (err: Error) => void;

  constructor(opts: RetryOptions) {
    this.url = opts.url;
    this.initialDelayMs = opts.initialDelayMs ?? 1000;
    this.maxDelayMs = opts.maxDelayMs ?? 30000;
    this.maxRetries = opts.maxRetries ?? Infinity;
    this.onOpen = opts.onOpen;
    this.onMessage = opts.onMessage;
    this.onClose = opts.onClose;
    this.onError = opts.onError;
  }

  connect(): void {
    if (this.closed) return;

    logger.info('ws.connecting', { message: this.url });

    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      logger.info('ws.connected', { message: this.url });
      this.retryCount = 0;
      this.onOpen?.();
    });

    this.ws.on('message', (data, isBinary) => {
      this.onMessage?.(data, isBinary);
    });

    this.ws.on('close', (code, reason) => {
      logger.info('ws.closed', { message: `code=${code} reason=${reason.toString()}` });
      this.onClose?.(code, reason);
      this.reconnect();
    });

    this.ws.on('error', (err) => {
      logger.error('ws.error', { message: err.message });
      this.onError?.(err);
      // 'close' event will fire after 'error', triggering reconnect
    });
  }

  private reconnect(): void {
    if (this.closed) return;
    if (this.retryCount >= this.maxRetries) {
      logger.error('ws.max_retries', { message: `Gave up after ${this.maxRetries} retries` });
      return;
    }

    const delay = Math.min(
      this.initialDelayMs * Math.pow(2, this.retryCount) + Math.random() * 1000,
      this.maxDelayMs
    );
    this.retryCount++;

    logger.info('ws.reconnecting', { message: `Attempt ${this.retryCount} in ${Math.round(delay)}ms` });
    setTimeout(() => this.connect(), delay);
  }

  send(data: string | Buffer): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(data);
    return true;
  }

  sendJson(msg: Record<string, unknown>): boolean {
    return this.send(JSON.stringify(msg));
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  close(): void {
    this.closed = true;
    this.ws?.close(1000, 'Client shutting down');
    this.ws = null;
  }
}
