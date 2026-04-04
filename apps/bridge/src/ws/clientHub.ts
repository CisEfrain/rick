import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../common/logger.js';
import { config } from '../config/appConfig.js';
import { Pipeline } from '../pipeline/pipeline.js';

export function setupClientHub(wss: WebSocketServer) {
  wss.on('connection', (ws: WebSocket, req: any) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const sessionId = url.searchParams.get('sessionId') || `session-${Date.now()}`;
    const token = url.searchParams.get('token');

    if (config.internalToken && token !== config.internalToken) {
      logger.warn('client.unauthorized', { sessionId });
      ws.close(1008, 'Unauthorized');
      return;
    }

    logger.info('client.connected', { sessionId });

    // Keep connection alive through Railway/proxies
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, 25000);

    // Initialize the pipeline for this client
    const pipeline = new Pipeline(sessionId, ws);

    ws.on('message', (message: any, isBinary: boolean) => {
      if (isBinary) {
        // Forward client audio to STT pipeline
        pipeline.sendAudio(message as Buffer);
      } else {
        // Handle text messages from client
        try {
          const data = JSON.parse(message.toString());
          if (data.type === 'stop') {
            logger.info('client.stop_requested', { sessionId });
            pipeline.handleStop();
          }
        } catch (e) {
          logger.warn('client.parse_error', { sessionId, message: message.toString() });
        }
      }
    });

    ws.on('close', () => {
      clearInterval(pingInterval);
      logger.info('client.disconnected', { sessionId });
      pipeline.close();
    });

    ws.on('error', (err) => {
      logger.error('client.error', { sessionId, message: err.message });
      pipeline.close();
    });
  });
}
