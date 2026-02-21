import { WebSocket } from 'ws';

// Polyfill WebSocket globally so Deepgram SDK uses 'ws' instead of Node's experimental undici WebSocket
(globalThis as any).WebSocket = WebSocket;
