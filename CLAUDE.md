# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rick is a real-time voice agent system powered by Deepgram Voice Agent. Audio flows: **Node Client** (mic capture) → **Bridge** (WebSocket relay) → **Deepgram** (STT + LLM + TTS) → Bridge → Node Client (speaker playback). Tool calls from Deepgram are forwarded to **n8n** via HTTP webhook.

The project is in Spanish (prompts, agent persona, function names like `buscar_clima`).

## Monorepo Structure

npm workspaces monorepo (also has `pnpm-workspace.yaml`). Two apps under `apps/`:

- **`apps/bridge`** — Express + WebSocket server. Authenticates clients via `INTERNAL_TOKEN`, creates a `DeepgramSession` per client connection, forwards audio bidirectionally, and delegates function calls to n8n. Deployed on Railway.
- **`apps/node-client`** — CLI client for Raspberry Pi or Windows. Captures mic audio via SoX (Windows) or arecord (Linux), streams PCM 16kHz to bridge, plays back agent audio. Supports `!stop` (interrupt) and `!quit` commands.

## Common Commands

```bash
npm install              # Install all workspace dependencies
npm run dev              # Start bridge + client concurrently
npm run dev:bridge       # Start bridge only (tsx watch, auto-reload)
npm run dev:client       # Start client only (tsx, no watch)
npm run build            # Compile both apps (tsc)
npm run build:bridge     # Compile bridge only
npm run build:client     # Compile client only
```

Individual apps use `tsx` for dev and `tsc` for production builds. Output goes to `dist/`.

## Architecture Details

### Audio Pipeline
- Format: PCM linear16, 16kHz sample rate, raw (no container)
- Client sends binary WebSocket frames (audio) and JSON text frames (commands like `{type:"stop"}`)
- Bridge sends binary frames (audio from Deepgram) and JSON frames (`{type:"audio.start"}`, `{type:"audio.end"}`) to client
- Client mutes mic while agent speaks to prevent echo (configurable via `MUTE_MIC_WHILE_SPEAKING`)

### Key Flow: Bridge WebSocket Connection
1. Client connects with `?sessionId=X&token=Y` query params
2. `clientHub.ts` authenticates and creates a `DeepgramSession`
3. `DeepgramSession` opens Deepgram Agent API, configures STT (nova-3), LLM (gpt-4o-mini), TTS (aura-2-alvaro-es)
4. On `FunctionCallRequest`, bridge calls `n8nClient.ts` → HTTP POST to n8n webhook → returns `FunctionCallResponse` to Deepgram

### Key Flow: Node Client
1. `ReconnectingWebSocket` (in `common/retry.ts`) handles connection with auto-reconnect
2. `Recorder` (in `audio/recorder.ts`) captures mic audio continuously (VAD is handled by Deepgram)
3. `AudioPlayer` (in `audio/player.ts`) queues and plays back agent audio chunks

## Environment Variables

See `apps/bridge/.env.example` and `apps/node-client/.env.example` for all variables. Critical ones:
- `DEEPGRAM_API_KEY` — Required for bridge
- `INTERNAL_TOKEN` — Shared secret for client-bridge auth
- `N8N_TOOL_WEBHOOK_URL` — Webhook endpoint for tool execution
- `AUDIO_BACKEND` — `sox` (Windows) or `arecord` (Linux) for client

## Tech Stack

- TypeScript (strict), Node.js >=20
- `@deepgram/sdk` for Voice Agent API
- `ws` for WebSocket (both apps)
- `express` for HTTP endpoints (bridge)
- `node-record-lpcm16` for mic capture (client)
- `tsx` for dev, `tsc` for builds
