import 'dotenv/config';
import { RickClient } from './client.js';

const PLATFORM = process.env.PLATFORM || 'raspi';

async function main() {
  console.log(`=== Rick Node Client (${PLATFORM}) ===`);

  let audioIn, audioOut, display, motors, button, telemetry;

  if (PLATFORM === 'raspi') {
    const { NativeAudioInput } = await import('./adapters/raspi/audio-input-native.js');
    const { NativeAudioOutput } = await import('./adapters/raspi/audio-output-native.js');
    const { NoopDisplay } = await import('./adapters/raspi/display-noop.js');
    const { NoopMotors } = await import('./adapters/raspi/motors-noop.js');
    const { NoopButton } = await import('./adapters/raspi/button-noop.js');
    const { NativeTelemetry } = await import('./adapters/raspi/telemetry-native.js');

    audioIn = new NativeAudioInput();
    audioOut = new NativeAudioOutput();
    display = new NoopDisplay();
    motors = new NoopMotors();
    button = new NoopButton();
    telemetry = new NativeTelemetry();

  } else if (PLATFORM === 'emulator') {
    const { FrontendWSServer } = await import('./adapters/emulator/frontend-ws-server.js');
    const { BrowserAudioInput } = await import('./adapters/emulator/audio-browser-input.js');
    const { BrowserAudioOutput } = await import('./adapters/emulator/audio-browser-output.js');
    const { BrowserDisplay } = await import('./adapters/emulator/display-browser.js');
    const { BrowserMotors } = await import('./adapters/emulator/motors-browser.js');
    const { BrowserButton } = await import('./adapters/emulator/button-browser.js');
    const { FakeTelemetry } = await import('./adapters/emulator/telemetry-fake.js');

    const frontendPort = parseInt(process.env.FRONTEND_WS_PORT || '3001');
    const frontendWS = new FrontendWSServer(frontendPort);
    await frontendWS.start();

    audioIn = new BrowserAudioInput(frontendWS);
    audioOut = new BrowserAudioOutput(frontendWS);
    display = new BrowserDisplay(frontendWS);
    motors = new BrowserMotors(frontendWS);
    button = new BrowserButton(frontendWS);
    telemetry = new FakeTelemetry();

    console.log(`Frontend WS: ws://localhost:${frontendPort}`);
    console.log('Abrí http://localhost:5173 en Chrome para usar el emulador.');

  } else {
    throw new Error(`Plataforma desconocida: ${PLATFORM}`);
  }

  const client = new RickClient(audioIn, audioOut, display, motors, button, telemetry, {
    bridgeWsUrl: process.env.BRIDGE_WS_URL || 'ws://localhost:3000',
    sessionId: process.env.SESSION_ID || 'rick-001',
    token: process.env.INTERNAL_TOKEN || process.env.TOKEN || '',
    muteMicWhileSpeaking: (process.env.MUTE_MIC_WHILE_SPEAKING || 'true').toLowerCase() === 'true',
    playbackDoneDelayMs: parseInt(process.env.PLAYBACK_DONE_DELAY_MS || '200', 10),
    pttMode: PLATFORM === 'emulator',
  });

  await client.start();

  const shutdown = async () => {
    console.log('\nApagando...');
    await client.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(console.error);
