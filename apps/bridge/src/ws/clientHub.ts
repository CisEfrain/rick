import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../common/logger.js';
import { config } from '../config/deepgramConfig.js';
import { DeepgramSession } from './deepgramSession.js';

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

    // Initialize the Deepgram Voice Agent session for this client
    const dgSession = new DeepgramSession(sessionId, ws);

    ws.on('message', (message: any, isBinary: boolean) => {
      if (isBinary) {
        // Forward client audio to Deepgram
        dgSession.sendAudio(message as Buffer);
      } else {
        // Handle optional text messages from client, like STOP
        try {
          const data = JSON.parse(message.toString());
          if (data.type === 'stop') {
             logger.info('client.stop_requested', { sessionId });
          }
        } catch (e) {
             logger.warn('client.parse_error', { sessionId, message: message.toString() });
        }
      }
    });

    ws.on('close', () => {
      logger.info('client.disconnected', { sessionId });
      dgSession.close();
    });

    ws.on('error', (err) => {
      logger.error('client.error', { sessionId, message: err.message });
      dgSession.close();
    });
  });
}
