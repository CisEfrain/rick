import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../../common/logger.js';

export class FrontendWSServer extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();

  constructor(private port: number) {
    super();
  }

  async start(): Promise<void> {
    this.wss = new WebSocketServer({ port: this.port });

    this.wss.on('connection', (ws) => {
      logger.info('frontend-ws.connected');
      this.clients.add(ws);

      ws.on('message', (data, isBinary) => {
        if (isBinary) {
          this.emit('audio_from_browser', Buffer.from(data as ArrayBuffer));
        } else {
          try {
            const msg = JSON.parse(data.toString());
            this.emit(msg.type, msg);
          } catch {
            // ignore malformed JSON
          }
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        logger.info('frontend-ws.disconnected');
      });
    });

    logger.info('frontend-ws.listening', { port: this.port });
  }

  send(msg: Record<string, unknown>): void {
    const data = JSON.stringify(msg);
    for (const c of this.clients) {
      if (c.readyState === WebSocket.OPEN) c.send(data);
    }
  }

  sendBinary(buffer: Buffer): void {
    for (const c of this.clients) {
      if (c.readyState === WebSocket.OPEN) c.send(buffer);
    }
  }

  hasClients(): boolean {
    return this.clients.size > 0;
  }

  async stop(): Promise<void> {
    for (const c of this.clients) c.close();
    this.clients.clear();
    this.wss?.close();
    this.wss = null;
  }
}
