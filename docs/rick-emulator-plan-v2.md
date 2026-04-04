# Rick Emulator — Plan de Implementación (Revisado)

## Mismo Node Client, distinto hardware

---

## 1. Principio arquitectónico

El emulador no es un proyecto aparte. Es el mismo Node Client que corre en la Raspberry Pi, pero con una capa de hardware diferente. La lógica de negocio (protocolo WebSocket con el Bridge, manejo de estados, half-duplex, idle timeout, reconexión) se comparte al 100%. Lo único que cambia es cómo se interactúa con el mundo físico: en la Pi se usa arecord/aplay/I2C/GPIO, en el emulador se usa un browser conectado por WebSocket local.

Esto se logra refactorizando el Node Client actual para que use interfaces abstractas de hardware, con dos implementaciones: una para la Pi (que es básicamente el código actual extraído a adaptadores) y una para el emulador (que delega al browser vía WebSocket).

Los eventos son idénticos. El Bridge no distingue. Un cambio en la lógica del Node Client aplica automáticamente a ambos entornos.

---

## 2. Qué se reutiliza del Node Client actual

Para entender bien el refactor, hay que ver qué hace hoy el Node Client y qué parte es lógica vs hardware.

### Lógica de negocio (se reutiliza 100%, no se toca)

Todo lo que habla con el Bridge por WebSocket se mantiene intacto. Esto incluye la conexión WebSocket al Bridge con autenticación por token, el envío de audio PCM binario upstream (micrófono → Bridge), la recepción de audio PCM binario downstream (Bridge → parlante), el parsing de mensajes JSON de control del Bridge (estados, transcripciones, tool calls, comandos de motores), el protocolo de handshake al conectar (enviar hello con session ID), la lógica de half-duplex (mutear micrófono mientras Rick habla, reactivar después de un delay), el idle timeout (desconectar del Bridge después de 2 minutos sin actividad), la reconexión automática cuando se pierde la conexión, y el manejo de comandos del usuario como `!stop` y `!quit`.

### Hardware (se abstrae en interfaces)

Todo lo que toca dispositivos físicos se extrae a adaptadores intercambiables. Esto incluye la captura de audio (hoy es arecord con ALSA, en el emulador será el micrófono del browser), la reproducción de audio (hoy es aplay con ALSA, en el emulador serán los speakers del browser), la pantalla OLED (hoy es un script Python con luma.oled por I2C, en el emulador será un canvas en el browser), los motores (hoy es planificado como GPIO con driver L298N, en el emulador será una visualización 2D), el botón arcade (hoy es planificado como GPIO con pull-up, en el emulador será la tecla Space o un botón en pantalla), y la telemetría del sistema (hoy es vcgencmd/proc/free, en el emulador serán valores simulados).

---

## 3. Estructura refactorizada del proyecto

```
rick/
├── apps/
│   ├── node-client/                    # Node Client (compartido Pi + emulador)
│   │   ├── src/
│   │   │   ├── index.ts                # Entry point (selecciona adaptadores)
│   │   │   ├── client.ts               # Lógica de negocio principal
│   │   │   ├── bridge-connection.ts    # WebSocket al Bridge
│   │   │   ├── state-machine.ts        # Máquina de estados de Rick
│   │   │   ├── half-duplex.ts          # Control de mute del micrófono
│   │   │   │
│   │   │   ├── interfaces/             # ← NUEVO: Contratos de hardware
│   │   │   │   ├── audio-input.ts      # Interface para captura de audio
│   │   │   │   ├── audio-output.ts     # Interface para reproducción
│   │   │   │   ├── display.ts          # Interface para pantalla
│   │   │   │   ├── motors.ts           # Interface para motores
│   │   │   │   ├── button.ts           # Interface para botón PTT
│   │   │   │   └── telemetry.ts        # Interface para telemetría
│   │   │   │
│   │   │   ├── adapters/
│   │   │   │   ├── raspi/              # ← Implementación para Raspberry Pi
│   │   │   │   │   ├── audio-arecord.ts
│   │   │   │   │   ├── audio-aplay.ts
│   │   │   │   │   ├── display-oled.ts
│   │   │   │   │   ├── motors-gpio.ts
│   │   │   │   │   ├── button-gpio.ts
│   │   │   │   │   └── telemetry-pi.ts
│   │   │   │   │
│   │   │   │   └── emulator/           # ← Implementación para emulador
│   │   │   │       ├── audio-browser-input.ts
│   │   │   │       ├── audio-browser-output.ts
│   │   │   │       ├── display-browser.ts
│   │   │   │       ├── motors-browser.ts
│   │   │   │       ├── button-browser.ts
│   │   │   │       ├── telemetry-fake.ts
│   │   │   │       └── frontend-ws-server.ts   # WebSocket para el browser
│   │   │   │
│   │   │   └── utils/
│   │   │       └── pcm.ts              # Utilidades de audio PCM
│   │   │
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── .env
│   │
│   ├── emulator-frontend/              # ← NUEVO: UI React del emulador
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useEmulatorSocket.ts
│   │   │   │   └── useMicrophone.ts
│   │   │   └── components/
│   │   │       ├── OLEDScreen.tsx
│   │   │       ├── MicButton.tsx
│   │   │       ├── RobotMap.tsx
│   │   │       ├── Conversation.tsx
│   │   │       ├── LogViewer.tsx
│   │   │       └── HardwarePanel.tsx
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   └── bridge/                         # Bridge (sin cambios)
│       └── ...
```

El punto clave es que `apps/node-client` es uno solo. No hay un `apps/emulator/node` separado. El Node Client selecciona qué adaptadores usar basándose en una variable de entorno.

---

## 4. Interfaces de hardware

Estas interfaces definen el contrato que cualquier adaptador debe cumplir. Son la capa de abstracción entre la lógica de negocio y el hardware.

### AudioInput: captura de audio del micrófono

```typescript
// apps/node-client/src/interfaces/audio-input.ts
import { EventEmitter } from "events";

// Representa un dispositivo de captura de audio.
// En la Pi: arecord capturando PCM 16kHz 16-bit mono de un micrófono USB.
// En el emulador: el micrófono del browser enviando PCM por WebSocket.
//
// Eventos:
//   "data" (buffer: Buffer)  — chunk de audio PCM listo para enviar al Bridge
//   "error" (err: Error)     — error de captura
export interface AudioInput extends EventEmitter {
  // Empezar a capturar audio. Emite eventos "data" continuamente.
  start(): Promise<void>;

  // Dejar de capturar audio.
  stop(): Promise<void>;

  // ¿Está capturando actualmente?
  isActive(): boolean;
}
```

### AudioOutput: reproducción de audio por parlante

```typescript
// apps/node-client/src/interfaces/audio-output.ts
import { EventEmitter } from "events";

// Representa un dispositivo de reproducción de audio.
// En la Pi: aplay reproduciendo PCM 16kHz 16-bit mono por la tarjeta de sonido USB.
// En el emulador: el browser reproduciendo audio vía Web Audio API.
//
// Eventos:
//   "started"      — empezó a reproducir
//   "finished"     — terminó de reproducir todo el audio en cola
//   "error" (err)  — error de reproducción
export interface AudioOutput extends EventEmitter {
  // Encolar un chunk de audio PCM para reproducción.
  // Los chunks se reproducen en orden FIFO.
  enqueue(pcmBuffer: Buffer): void;

  // Detener la reproducción inmediatamente y vaciar la cola.
  stop(): void;

  // ¿Está reproduciendo actualmente?
  isPlaying(): boolean;
}
```

### Display: pantalla OLED

```typescript
// apps/node-client/src/interfaces/display.ts

// Representa la pantalla de Rick.
// En la Pi: SH1106 128x64 por I2C, controlada con luma.oled.
// En el emulador: canvas en el browser.
export interface Display {
  // Actualizar el estado mostrado en la pantalla.
  // El adaptador decide cómo dibujar cada estado.
  setState(state: string, extra?: string): void;

  // Inicializar la pantalla.
  init(): Promise<void>;

  // Apagar la pantalla.
  shutdown(): Promise<void>;
}
```

### Motors: control de motores

```typescript
// apps/node-client/src/interfaces/motors.ts
import { EventEmitter } from "events";

// Representa los motores de tracción diferencial.
// En la Pi: GPIO → Driver L298N/TB6612FNG → Motores TT.
// En el emulador: visualización 2D en el browser.
//
// Eventos:
//   "started" (direction, duration)  — movimiento iniciado
//   "stopped"                        — movimiento terminado
export interface Motors extends EventEmitter {
  // Ejecutar un movimiento.
  move(direction: string, durationMs: number): Promise<void>;

  // Detener inmediatamente.
  stop(): void;
}
```

### Button: botón push-to-talk

```typescript
// apps/node-client/src/interfaces/button.ts
import { EventEmitter } from "events";

// Representa el botón arcade de push-to-talk.
// En la Pi: botón físico conectado a un pin GPIO con pull-up.
// En el emulador: tecla Space o botón en el browser.
//
// Eventos:
//   "press"    — botón presionado
//   "release"  — botón soltado
export interface Button extends EventEmitter {
  // Empezar a escuchar eventos del botón.
  init(): Promise<void>;

  // Dejar de escuchar.
  destroy(): void;
}
```

### Telemetry: información del sistema

```typescript
// apps/node-client/src/interfaces/telemetry.ts

// Información de estado del hardware.
export interface TelemetryData {
  cpu: number;       // Porcentaje de uso de CPU
  ram: number;       // MB de RAM usados
  temp: number;      // Temperatura en Celsius
  wifi: number;      // Señal WiFi en dBm
  battery: number;   // Porcentaje de batería (100 si no hay sensor)
}

export interface Telemetry {
  // Leer el estado actual del hardware.
  read(): Promise<TelemetryData>;
}
```

---

## 5. Refactor del Node Client actual

### El client.ts principal (lógica pura, sin hardware)

```typescript
// apps/node-client/src/client.ts
import { BridgeConnection } from "./bridge-connection";
import { AudioInput } from "./interfaces/audio-input";
import { AudioOutput } from "./interfaces/audio-output";
import { Display } from "./interfaces/display";
import { Motors } from "./interfaces/motors";
import { Button } from "./interfaces/button";
import { Telemetry } from "./interfaces/telemetry";

// RickClient es la lógica de negocio del Node Client.
// No sabe nada de hardware concreto. Recibe adaptadores por inyección.
// El mismo código corre en la Pi y en el emulador.
export class RickClient {
  private state: string = "IDLE";
  private isMuted: boolean = false;
  private idleTimer: NodeJS.Timeout | null = null;

  constructor(
    private bridge: BridgeConnection,  // WebSocket al Bridge
    private audioIn: AudioInput,        // Micrófono (arecord o browser)
    private audioOut: AudioOutput,      // Parlante (aplay o browser)
    private display: Display,           // Pantalla (OLED o browser canvas)
    private motors: Motors,             // Motores (GPIO o browser 2D)
    private button: Button,             // Botón PTT (GPIO o Space key)
    private telemetry: Telemetry,       // Telemetría (Pi stats o fake)
    private config: any,
  ) {
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    // ── Botón push-to-talk ──
    // Mismo evento sin importar si es un GPIO o la tecla Space
    this.button.on("press", () => {
      if (this.state === "IDLE" && !this.isMuted) {
        this.startListening();
      }
    });

    this.button.on("release", () => {
      if (this.state === "LISTENING") {
        this.stopListening();
      }
    });

    // ── Audio del micrófono → Bridge ──
    // Cada chunk de PCM del adaptador se envía al Bridge tal cual.
    // No importa si vino de arecord o del browser.
    this.audioIn.on("data", (pcmBuffer: Buffer) => {
      if (!this.isMuted) {
        this.bridge.sendAudio(pcmBuffer);
        this.resetIdleTimer();
      }
    });

    // ── Reproducción terminó ──
    this.audioOut.on("finished", () => {
      // Half-duplex: reactivar micrófono después del delay
      setTimeout(() => {
        this.isMuted = false;
        this.setState("IDLE");
      }, this.config.playbackDoneDelayMs);
    });

    // ── Mensajes de control del Bridge ──
    // Estos eventos son idénticos para Pi y emulador
    this.bridge.on("state", (data) => {
      this.setState(data.state, data.extra);
    });

    this.bridge.on("audio", (pcmBuffer: Buffer) => {
      // Audio de respuesta TTS: reproducir por el adaptador de audio
      this.audioOut.enqueue(pcmBuffer);
    });

    this.bridge.on("speaking_start", () => {
      // Half-duplex: mutear micrófono mientras Rick habla
      if (this.config.muteMicWhileSpeaking) {
        this.isMuted = true;
      }
      this.setState("SPEAKING");
    });

    this.bridge.on("speaking_done", () => {
      // El audioOut.on("finished") maneja la reactivación
    });

    this.bridge.on("motor_command", (data) => {
      // Ejecutar movimiento con el adaptador de motores
      // En la Pi mueve GPIOs, en el emulador mueve el mapa 2D
      this.motors.move(data.direction, data.duration);
    });

    this.bridge.on("transcript", (data) => {
      // Mostrar transcripción parcial en la pantalla
      this.display.setState("LISTENING", data.text?.slice(0, 21));
    });

    this.bridge.on("error", (data) => {
      this.setState("ERROR");
    });
  }

  async start() {
    await this.display.init();
    await this.button.init();
    await this.bridge.connect();
    this.setState("IDLE");
    this.startTelemetryLoop();
  }

  private async startListening() {
    this.setState("LISTENING");
    await this.audioIn.start();
    this.bridge.sendControl({ type: "audio_start" });
  }

  private async stopListening() {
    await this.audioIn.stop();
    this.bridge.sendControl({ type: "audio_stop" });
    // El estado cambiará a PROCESSING cuando el Bridge notifique
  }

  private setState(state: string, extra?: string) {
    this.state = state;
    this.display.setState(state, extra);
    // Si el Bridge reporta speaking_start, el audio empezará solo
    if (state === "SPEAKING" && this.config.muteMicWhileSpeaking) {
      this.isMuted = true;
      this.audioIn.stop().catch(() => {});
    }
  }

  private resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.bridge.sendControl({ type: "idle_disconnect" });
    }, 2 * 60 * 1000); // 2 minutos
  }

  private startTelemetryLoop() {
    setInterval(async () => {
      const data = await this.telemetry.read();
      this.bridge.sendControl({ type: "telemetry", ...data });
    }, 10000); // cada 10 segundos
  }

  async stop() {
    await this.audioIn.stop();
    this.audioOut.stop();
    this.display.shutdown();
    this.bridge.disconnect();
    this.button.destroy();
  }
}
```

### El entry point que selecciona adaptadores

```typescript
// apps/node-client/src/index.ts
import { config } from "dotenv";
config();

import { RickClient } from "./client";
import { BridgeConnection } from "./bridge-connection";

const PLATFORM = process.env.PLATFORM || "raspi"; // "raspi" o "emulator"

async function main() {
  console.log(`=== Rick Node Client (${PLATFORM}) ===`);

  // Cargar los adaptadores según la plataforma.
  // Es el único lugar del código que sabe qué hardware hay.
  let audioIn, audioOut, display, motors, button, telemetry;

  if (PLATFORM === "raspi") {
    // ── Adaptadores para Raspberry Pi ──
    const { ArecordInput } = await import("./adapters/raspi/audio-arecord");
    const { AplayOutput } = await import("./adapters/raspi/audio-aplay");
    const { OLEDDisplay } = await import("./adapters/raspi/display-oled");
    const { GPIOMotors } = await import("./adapters/raspi/motors-gpio");
    const { GPIOButton } = await import("./adapters/raspi/button-gpio");
    const { PiTelemetry } = await import("./adapters/raspi/telemetry-pi");

    audioIn = new ArecordInput({ sampleRate: 16000, channels: 1 });
    audioOut = new AplayOutput({ device: "plughw:0,0" });
    display = new OLEDDisplay({ address: 0x3c, port: 1 });
    motors = new GPIOMotors({ leftPins: [17, 27], rightPins: [22, 23] });
    button = new GPIOButton({ pin: 24 });
    telemetry = new PiTelemetry();

  } else if (PLATFORM === "emulator") {
    // ── Adaptadores para emulador ──
    // Todos delegan al browser vía un WebSocket local (puerto 3001)
    const { FrontendWSServer } = await import("./adapters/emulator/frontend-ws-server");
    const { BrowserAudioInput } = await import("./adapters/emulator/audio-browser-input");
    const { BrowserAudioOutput } = await import("./adapters/emulator/audio-browser-output");
    const { BrowserDisplay } = await import("./adapters/emulator/display-browser");
    const { BrowserMotors } = await import("./adapters/emulator/motors-browser");
    const { BrowserButton } = await import("./adapters/emulator/button-browser");
    const { FakeTelemetry } = await import("./adapters/emulator/telemetry-fake");

    // El servidor WS es compartido por todos los adaptadores del emulador
    const frontendPort = parseInt(process.env.FRONTEND_WS_PORT || "3001");
    const frontendWS = new FrontendWSServer(frontendPort);
    await frontendWS.start();

    audioIn = new BrowserAudioInput(frontendWS);
    audioOut = new BrowserAudioOutput(frontendWS);
    display = new BrowserDisplay(frontendWS);
    motors = new BrowserMotors(frontendWS);
    button = new BrowserButton(frontendWS);
    telemetry = new FakeTelemetry();

    console.log(`Frontend WS: ws://localhost:${frontendPort}`);
    console.log(`Abrí http://localhost:5173 en Chrome para usar el emulador.`);

  } else {
    throw new Error(`Plataforma desconocida: ${PLATFORM}`);
  }

  // La lógica del cliente es idéntica en ambos casos
  const bridge = new BridgeConnection({
    url: process.env.BRIDGE_WS_URL || "ws://localhost:8080",
    token: process.env.TOKEN || "",
    sessionId: process.env.SESSION_ID || "rick-001",
  });

  const client = new RickClient(
    bridge, audioIn, audioOut, display, motors, button, telemetry,
    {
      muteMicWhileSpeaking: process.env.MUTE_MIC_WHILE_SPEAKING !== "false",
      playbackDoneDelayMs: parseInt(process.env.PLAYBACK_DONE_DELAY_MS || "500"),
    }
  );

  await client.start();

  // Manejo de señales para shutdown limpio
  process.on("SIGINT", async () => {
    console.log("\nApagando...");
    await client.stop();
    process.exit(0);
  });
}

main().catch(console.error);
```

---

## 6. Adaptadores del emulador (los 6 nuevos archivos)

### FrontendWSServer (servidor WebSocket compartido)

Todos los adaptadores del emulador comparten un único servidor WebSocket que se comunica con el frontend React. Este servidor se crea una vez en el index.ts y se pasa por inyección a cada adaptador.

```typescript
// apps/node-client/src/adapters/emulator/frontend-ws-server.ts
import { WebSocketServer, WebSocket } from "ws";
import { EventEmitter } from "events";

// Servidor WebSocket local que conecta el Node Client con el frontend React.
// Es el equivalente del hardware: en vez de GPIOs, I2C, y ALSA,
// los adaptadores del emulador hablan con el browser a través de este server.
export class FrontendWSServer extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();

  constructor(private port: number) { super(); }

  async start() {
    this.wss = new WebSocketServer({ port: this.port });
    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      ws.on("message", (data, isBinary) => {
        if (isBinary) {
          // Audio PCM del micrófono del browser
          this.emit("audio_from_browser", Buffer.from(data as ArrayBuffer));
        } else {
          const msg = JSON.parse(data.toString());
          // Reemitir evento por tipo (ptt_press, ptt_release, etc.)
          this.emit(msg.type, msg);
        }
      });
      ws.on("close", () => this.clients.delete(ws));
    });
  }

  // Enviar JSON al frontend
  send(msg: any) {
    const data = JSON.stringify(msg);
    for (const c of this.clients) {
      if (c.readyState === WebSocket.OPEN) c.send(data);
    }
  }

  // Enviar audio binario al frontend (para reproducción)
  sendBinary(buffer: Buffer) {
    for (const c of this.clients) {
      if (c.readyState === WebSocket.OPEN) c.send(buffer);
    }
  }
}
```

### BrowserAudioInput

```typescript
// apps/node-client/src/adapters/emulator/audio-browser-input.ts
import { EventEmitter } from "events";
import { AudioInput } from "../../interfaces/audio-input";
import { FrontendWSServer } from "./frontend-ws-server";

// Captura de audio emulada: el browser graba con getUserMedia,
// convierte a PCM 16kHz, y envía por WebSocket.
// Este adaptador simplemente escucha esos frames y los reemite
// como eventos "data", igual que haría ArecordInput.
export class BrowserAudioInput extends EventEmitter implements AudioInput {
  private active = false;

  constructor(private frontend: FrontendWSServer) {
    super();
    // Cuando el browser envía audio PCM, reemitirlo como evento "data"
    // para que el RickClient lo envíe al Bridge
    frontend.on("audio_from_browser", (buffer: Buffer) => {
      if (this.active) this.emit("data", buffer);
    });
  }

  async start() {
    this.active = true;
    // Notificar al browser que empiece a capturar
    this.frontend.send({ type: "mic_start" });
  }

  async stop() {
    this.active = false;
    this.frontend.send({ type: "mic_stop" });
  }

  isActive() { return this.active; }
}
```

### BrowserAudioOutput

```typescript
// apps/node-client/src/adapters/emulator/audio-browser-output.ts
import { EventEmitter } from "events";
import { AudioOutput } from "../../interfaces/audio-output";
import { FrontendWSServer } from "./frontend-ws-server";

// Reproducción emulada: envía audio PCM al browser para que
// lo reproduzca con Web Audio API, igual que aplay lo haría
// con la tarjeta de sonido USB.
export class BrowserAudioOutput extends EventEmitter implements AudioOutput {
  private playing = false;
  private queue: Buffer[] = [];

  constructor(private frontend: FrontendWSServer) {
    super();
    // Cuando el browser confirma que terminó de reproducir
    frontend.on("playback_done", () => {
      if (this.queue.length > 0) {
        this.frontend.sendBinary(this.queue.shift()!);
      } else {
        this.playing = false;
        this.emit("finished");
      }
    });
  }

  enqueue(pcmBuffer: Buffer) {
    if (!this.playing) {
      this.playing = true;
      this.emit("started");
      this.frontend.sendBinary(pcmBuffer);
    } else {
      this.queue.push(pcmBuffer);
    }
  }

  stop() {
    this.queue = [];
    this.playing = false;
    this.frontend.send({ type: "playback_stop" });
  }

  isPlaying() { return this.playing; }
}
```

### BrowserDisplay, BrowserMotors, BrowserButton, FakeTelemetry

Estos cuatro adaptadores son simples: envían estado al frontend vía JSON y escuchan eventos del browser.

```typescript
// display-browser.ts: llama frontend.send({ type: "oled", state, extra })
// motors-browser.ts: llama frontend.send({ type: "motor", direction, duration })
//                    y resuelve la Promise después de duration ms
// button-browser.ts: escucha frontend.on("ptt_press") y emite "press"
//                    escucha frontend.on("ptt_release") y emite "release"
// telemetry-fake.ts: retorna valores random realistas
//                    (cpu 8-35%, ram 250-380MB, temp 38-52°C)
```

---

## 7. Adaptadores de la Pi (refactor del código existente)

El código actual del Node Client que usa arecord, aplay, y scripts de Python se mueve a los adaptadores de `raspi/` sin cambiar su lógica interna. Por ejemplo, el código actual que hace `spawn("arecord", [...])` se encapsula en `ArecordInput.start()` y los chunks de audio que hoy se envían directamente al WebSocket del Bridge ahora se emiten como eventos `"data"`.

```typescript
// apps/node-client/src/adapters/raspi/audio-arecord.ts
import { EventEmitter } from "events";
import { spawn, ChildProcess } from "child_process";
import { AudioInput } from "../../interfaces/audio-input";

// Captura de audio real con arecord (ALSA).
// Es el mismo código que hoy está en el Node Client,
// encapsulado como un adaptador que implementa AudioInput.
export class ArecordInput extends EventEmitter implements AudioInput {
  private process: ChildProcess | null = null;
  private active = false;

  constructor(private opts: { sampleRate: number; channels: number }) {
    super();
  }

  async start() {
    if (this.active) return;
    this.process = spawn("arecord", [
      "-r", String(this.opts.sampleRate),
      "-c", String(this.opts.channels),
      "-f", "S16_LE",
      "-t", "raw",
      "-D", "plughw:1,0", // Ajustar según .asoundrc
      "-q",                // Silencioso (sin logs de arecord)
    ]);
    this.active = true;

    this.process.stdout?.on("data", (chunk: Buffer) => {
      // Emitir el chunk de PCM para que el RickClient lo envíe al Bridge
      this.emit("data", chunk);
    });

    this.process.stderr?.on("data", () => {
      // Ignorar — es un log informativo de arecord, no un error real
    });

    this.process.on("close", () => {
      this.active = false;
    });
  }

  async stop() {
    if (this.process) {
      this.process.kill("SIGTERM");
      this.process = null;
    }
    this.active = false;
  }

  isActive() { return this.active; }
}
```

La misma lógica se aplica a los demás adaptadores de la Pi: `AplayOutput` encapsula `spawn("aplay", [...])`, `OLEDDisplay` encapsula el script Python con `spawn("python3", ["scripts/oled_display.py"])`, y así sucesivamente.

---

## 8. Frontend React del emulador

El frontend se mantiene como proyecto separado en `apps/emulator-frontend/` porque es específico del emulador (la Pi no tiene browser). Pero los datos que muestra vienen todos del mismo Node Client a través del FrontendWSServer.

Los componentes son los mismos del diseño anterior (OLEDScreen, MicButton, RobotMap, Conversation, LogViewer, HardwarePanel). El hook `useEmulatorSocket` se conecta al WebSocket local del Node Client (puerto 3001) y maneja tanto mensajes JSON (estado, logs, motor) como audio binario (respuesta TTS para reproducir).

La única responsabilidad adicional del frontend vs el diseño anterior es manejar el micrófono con `getUserMedia`, convertir el audio a PCM 16kHz 16-bit mono, y enviarlo como frames binarios al Node Client por WebSocket. El Node Client lo reenvía al Bridge tal cual.

---

## 9. Variables de entorno

La misma `.env` del Node Client sirve para ambas plataformas. Solo se agrega `PLATFORM` y opcionalmente `FRONTEND_WS_PORT`.

```env
# apps/node-client/.env

# ── Plataforma ──
PLATFORM=emulator          # "raspi" en la Pi, "emulator" en la compu

# ── Conexión al Bridge (igual para ambas plataformas) ──
BRIDGE_WS_URL=wss://tu-bridge.up.railway.app
TOKEN=tu_token_secreto
SESSION_ID=rick-001

# ── Audio (solo aplica para raspi) ──
AUDIO_BACKEND=arecord

# ── Half-duplex (aplica para ambas) ──
MUTE_MIC_WHILE_SPEAKING=true
PLAYBACK_DONE_DELAY_MS=500

# ── Emulador (solo aplica para emulator) ──
FRONTEND_WS_PORT=3001
```

Para correr como Pi: `PLATFORM=raspi npx tsx src/index.ts`

Para correr como emulador: `PLATFORM=emulator npx tsx src/index.ts` y en otra terminal: `cd apps/emulator-frontend && npm run dev`

---

## 10. Resumen de decisiones

La decisión más importante de este plan es que el emulador no es un proyecto aparte sino un modo del mismo Node Client, seleccionable con la variable `PLATFORM`. Esto garantiza que la lógica de negocio se mantiene sincronizada entre la Pi y el emulador, que los bugs encontrados en un entorno se reproducen en el otro, y que agregar una feature nueva (como una tool o un tipo de mensaje) automáticamente funciona en ambos.

La segunda decisión importante es que el frontend React sí es un proyecto aparte (`apps/emulator-frontend/`), porque es un artefacto específico del emulador que la Pi no necesita. Pero su única conexión con el Node Client es un WebSocket estándar, así que está desacoplado y puede evolucionar independientemente.

La tercera decisión es usar adaptadores con interfaces explícitas en vez de condicionales `if (platform === "raspi")` dispersos por el código. Esto hace que agregar una tercera plataforma en el futuro (por ejemplo, un emulador de escritorio con Electron, o un modo de testing automatizado sin UI) sea tan simple como crear un nuevo set de adaptadores.
