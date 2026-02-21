import 'dotenv/config';
import { ReconnectingWebSocket } from './common/retry.js';
import { AudioPlayer } from './audio/player.js';
import { Recorder } from './audio/recorder.js';
import { logger } from './common/logger.js';
import * as readline from 'node:readline';

const SESSION_ID = process.env.SESSION_ID || 'raspi-001';
const BRIDGE_WS_URL = process.env.BRIDGE_WS_URL || 'ws://localhost:3000';
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || process.env.TOKEN || '';
const wsUrl = `${BRIDGE_WS_URL}?sessionId=${SESSION_ID}&token=${INTERNAL_TOKEN}`;

const player = new AudioPlayer(SESSION_ID);

const ws = new ReconnectingWebSocket({
  url: wsUrl,
  onOpen: () => {
    logger.info('client.connected', { sessionId: SESSION_ID });
  },
  onMessage: (data, isBinary) => {
    if (isBinary) {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      player.onAudioChunk(buffer);
      return;
    }

    try {
      const msg = JSON.parse(data.toString()) as Record<string, unknown>;
      if (msg.type === 'audio.start') {
        console.log('\n🔊 [Rick está hablando...]');
        player.onAudioStart('utt-agent', 'corr-agent', 0);
      }
      if (msg.type === 'audio.end') {
        console.log('⏹ [Rick terminó de hablar]\n');
        player.onAudioEnd('utt-agent', 'corr-agent', 0);
      }
    } catch {
      // ignore
    }
  },
  onClose: () => {
    logger.info('client.disconnected', { sessionId: SESSION_ID });
  },
  onError: () => {
    // Error logged by retry module
  },
});

player.setWs(ws);

let chunkCount = 0;
const recorder = new Recorder({
  sessionId: SESSION_ID,
  onAudioData: (chunk) => {
     try {
       // Visual indicator every ~1 second (16000 bytes/s approx)
       chunkCount++;
       if (chunkCount % 50 === 0) {
         process.stdout.write('.');
       }
       ws.send(chunk);
     } catch(e) { /* ignore */ }
  }
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '',
});

console.log('');
console.log('╔══════════════════════════════════════════════════╗');
console.log('║    Rick Voice Agent Client — Live Streaming     ║');
console.log('╠══════════════════════════════════════════════════╣');
console.log('║  Mic is OPEN and sending to Deepgram 24/7        ║');
console.log('║  Deepgram VAD will auto-detect when you speak    ║');
console.log('║  !stop              →  Interrupt current audio  ║');
console.log('║  !quit / Ctrl+C     →  Exit                     ║');
console.log('╚══════════════════════════════════════════════════╝');
console.log('');

// START RECORDING IMMEDIATELY
recorder.startRecording();
console.log('🎤 Live Recording Started. Go ahead and say "Hello"! (VAD is Active)');

rl.on('line', (line) => {
  const input = line.trim();
  if (!input) return;

  if (input === '!quit') {
    shutdown();
    return;
  }

  if (input === '!stop') {
    player.interrupt();
    try {
      ws.send(JSON.stringify({ type: 'stop' }));
    } catch(e) { /* ignore */ }
    console.log('⏹ Interrupted playback');
    return;
  }

  console.log(`Unknown command: ${input}`);
});

ws.connect();

function shutdown(): void {
  logger.info('client.shutdown', { sessionId: SESSION_ID });
  recorder.stopRecording();
  player.cleanup();
  ws.close();
  rl.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
