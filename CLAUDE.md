# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rick is a real-time voice agent system with a desacoplado pipeline. Audio flows: **Node Client** (mic capture) → **Bridge** (pipeline orchestrator) → **Deepgram Nova-3** (STT streaming) → **OpenAI GPT** (LLM + function calling) → **Deepgram Aura-2** (TTS) → Bridge → Node Client (speaker playback). Memory tools are handled locally by the bridge; external tools go to n8n via HTTP webhook.

The project is in Spanish (prompts, agent persona, function names like `recordar`).

## Monorepo Structure

npm workspaces monorepo. Three apps under `apps/`:

- **`apps/bridge`** — Express + WebSocket server. Creates a `Pipeline` per client that orchestrates STT→LLM→TTS, manages memory (JSON files), and handles function calls via OpenAI tool calling. Deployed on Railway.
- **`apps/node-client`** — Shared client for Raspberry Pi and emulator. Uses hardware abstraction interfaces (`interfaces/`) with platform-specific adapters (`adapters/raspi/` and `adapters/emulator/`). `PLATFORM` env var selects adapters at startup. Business logic in `client.ts` is platform-agnostic.
- **`apps/emulator-frontend`** — React + Vite browser UI for the emulator. Connects to Node Client via WebSocket (port 3001). Captures mic audio with `getUserMedia`, plays back TTS with Web Audio API, and shows OLED/motors/logs.

## Common Commands

```bash
npm install              # Install all workspace dependencies
npm run dev              # Start bridge + client concurrently
npm run dev:bridge       # Start bridge only (tsx watch, auto-reload)
npm run dev:client       # Start client only (tsx, no watch)
npm run dev:emulator     # Start bridge + client (emulator mode) + React frontend
npm run dev:emulator-frontend  # Start emulator React frontend only
npm run build            # Compile both apps (tsc)
npm run build:bridge     # Compile bridge only
npm run build:client     # Compile client only
```

Individual apps use `tsx` for dev and `tsc` for production builds. Output goes to `dist/`.

## Architecture Details

### Audio Pipeline
- Format: PCM linear16, 16kHz sample rate, mono, raw (no container)
- Client sends binary WebSocket frames (audio) and JSON text frames (`{type:"stop"}`)
- Bridge sends binary frames (audio) and JSON frames (`{type:"audio.start"}`, `{type:"audio.end"}`)
- Client mutes mic while agent speaks (`MUTE_MIC_WHILE_SPEAKING`)

### Key Flow: Bridge WebSocket Connection
1. Client connects with `?sessionId=X&token=Y` query params
2. `clientHub.ts` authenticates and creates a `Pipeline`
3. `Pipeline` connects Deepgram STT streaming (Nova-3), initializes OpenAI LLM with system prompt + tools + core memory
4. Audio chunks → STT transcription → LLM generates response (streaming, with optional tool calls handled by `toolExecutor.ts`) → `TextAccumulator` splits into sentences → TTS synthesizes each sentence → audio forwarded to client
5. Tools available: `recordar`, `buscar_memoria` (local memory), `obtener_clima` (OpenWeatherMap), `obtener_hora` (local), `mover`, `poner_alarma` (async via BackgroundQueue), `ejecutar_n8n` (webhook). Async tools dispatch to background queue; completed tasks trigger proactive LLM messages.

### Key Flow: Node Client
1. `index.ts` selects adapters based on `PLATFORM` env var (`raspi` or `emulator`)
2. `RickClient` in `client.ts` orchestrates all adapters and bridge connection
3. `ReconnectingWebSocket` handles bridge connection with auto-reconnect
4. `AudioInput` adapter captures mic audio continuously (VAD handled by Deepgram STT)
5. `AudioOutput` adapter queues and plays back agent audio chunks
6. Hardware interfaces: `AudioInput`, `AudioOutput`, `Display`, `Motors`, `Button`, `Telemetry`
7. Two adapter sets: `adapters/raspi/` (arecord/aplay/sox) and `adapters/emulator/` (browser via WebSocket)

### Key Flow: Emulator
1. `FrontendWSServer` creates WebSocket on port 3001 for browser communication
2. All emulator adapters delegate to browser via this shared WebSocket
3. React frontend (`apps/emulator-frontend`) captures mic with `getUserMedia`, plays audio with Web Audio API
4. Audio format: PCM 16kHz 16-bit mono (same as Pi), converted to/from Float32 in browser

### Memory System
- **Core Memory** (Level 1): User name, facts, preferences. Always injected into the system prompt on every session. Stored in JSON.
- **Archival Memory** (Level 2): Conversation history + explicit saves. Searchable via `buscar_memoria` tool.
- **Storage**: JSON files at `data/memory/{sessionId}.json` (configurable via `MEMORY_DIR` env var).
- **Lifecycle**: Conversations accumulated from STT utterances + LLM responses, persisted on idle disconnect. Core memory loaded on every pipeline init/reconnect.

### Idle Disconnect
- After `STT_IDLE_TIMEOUT_MS` (default 2 min) of no audio, STT session closes to save API credits.
- Client WebSocket stays open. On next audio, bridge reconnects STT and refreshes system prompt with latest memory.
- Greeting is suppressed when resuming a recent conversation.

## Environment Variables

See `apps/bridge/.env.example` and `apps/node-client/.env.example`. Key bridge vars:
- `DEEPGRAM_API_KEY` — Required (for STT + TTS)
- `OPENAI_API_KEY` — Required (for LLM)
- `INTERNAL_TOKEN` — Shared secret for client-bridge auth
- `N8N_TOOL_WEBHOOK_URL` — Webhook for external tools (optional)
- `STT_MODEL` — Deepgram STT model (default: nova-3)
- `STT_LANGUAGE` — STT language (default: es)
- `STT_IDLE_TIMEOUT_MS` — Idle timeout before disconnecting STT (default: 120000)
- `LLM_MODEL` — OpenAI model (default: gpt-4o-mini)
- `LLM_MAX_TOKENS` — Max response tokens (default: 300)
- `LLM_TEMPERATURE` — LLM temperature (default: 0.8)
- `TTS_MODEL` — Deepgram TTS voice (default: aura-2-es-alvaro)
- `TTS_SAMPLE_RATE` — TTS audio sample rate (default: 16000)
- `WEATHER_API_KEY` — OpenWeatherMap API key for `obtener_clima` tool (optional)
- `MEMORY_DIR` — Path for memory JSON files (default: `data/memory/`)

Key client vars:
- `PLATFORM` — `raspi` (default) or `emulator`
- `FRONTEND_WS_PORT` — WebSocket port for emulator frontend (default: 3001, only used when PLATFORM=emulator)

## Tech Stack

- TypeScript (strict), Node.js >=20
- `@deepgram/sdk` for STT streaming and TTS
- `openai` for LLM with function calling
- `ws` for WebSocket (both apps)
- `express` for HTTP endpoints (bridge)
- `tsx` for dev, `tsc` for builds

## Documentation Maintenance Rules

- When modifying code that changes behavior, update the relevant doc in `docs/`.
- Keep the documentation index in `README.md` in sync with actual files in `docs/`.
- CLAUDE.md is for Claude Code context only. Do not duplicate content from user-facing docs.
- All user-facing documentation is in Spanish. CLAUDE.md is in English.
- If adding a new feature, update `docs/functional.md`.
- If changing env vars, update the relevant `.env.example` file and `infra/railway/bridge.md`.
- If changing hardware connections, update `docs/hardware.md`.
