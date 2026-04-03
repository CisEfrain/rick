# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rick is a real-time voice agent system powered by Deepgram Voice Agent. Audio flows: **Node Client** (mic capture) → **Bridge** (WebSocket relay) → **Deepgram** (STT + LLM + TTS) → Bridge → Node Client (speaker playback). Memory tools are handled locally by the bridge; external tools go to n8n via HTTP webhook.

The project is in Spanish (prompts, agent persona, function names like `recordar`).

## Monorepo Structure

npm workspaces monorepo. Two apps under `apps/`:

- **`apps/bridge`** — Express + WebSocket server. Creates a `DeepgramSession` per client, forwards audio bidirectionally, manages memory (JSON files), and handles function calls. Deployed on Railway.
- **`apps/node-client`** — CLI client for Raspberry Pi or Windows. Captures mic audio, streams PCM 16kHz to bridge, plays back agent audio. Mutes mic during agent speech to prevent echo.

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
- Format: PCM linear16, 16kHz sample rate, mono, raw (no container)
- Client sends binary WebSocket frames (audio) and JSON text frames (`{type:"stop"}`)
- Bridge sends binary frames (audio) and JSON frames (`{type:"audio.start"}`, `{type:"audio.end"}`)
- Client mutes mic while agent speaks (`MUTE_MIC_WHILE_SPEAKING`)

### Key Flow: Bridge WebSocket Connection
1. Client connects with `?sessionId=X&token=Y` query params
2. `clientHub.ts` authenticates and creates a `DeepgramSession`
3. `DeepgramSession` opens Deepgram Agent API, configures STT (nova-3), LLM (gpt-4o-mini), TTS (aura-2-alvaro-es)
4. On `FunctionCallRequest`: if `recordar` or `buscar_memoria` → handle locally via `memoryStore.ts`; otherwise → POST to n8n webhook
5. `FunctionCallResponse` format: `{ type, id, name, content }` (per Deepgram docs)

### Key Flow: Node Client
1. `ReconnectingWebSocket` handles connection with auto-reconnect
2. `Recorder` captures mic audio continuously (VAD handled by Deepgram)
3. `AudioPlayer` queues and plays back agent audio chunks via aplay/SoX
4. Player reuses aplay process across utterances (drain delay prevents gaps)

### Memory System
- **Core Memory** (Level 1): User name, facts, preferences. Always injected into the system prompt on every session. Stored in JSON.
- **Archival Memory** (Level 2): Conversation history + explicit saves. Searchable via `buscar_memoria` tool.
- **Storage**: JSON files at `data/memory/{sessionId}.json` (configurable via `MEMORY_DIR` env var).
- **Lifecycle**: Conversations accumulated via `ConversationText` events, persisted on idle disconnect. Core memory loaded on every `connectDg()`.

### Idle Disconnect
- After `DG_IDLE_TIMEOUT_MS` (default 2 min) of no audio, Deepgram session closes to save API credits.
- Client WebSocket stays open. On next audio, bridge reconnects to Deepgram with memory context.
- Greeting is suppressed when resuming a recent conversation.

## Environment Variables

See `apps/bridge/.env.example` and `apps/node-client/.env.example`. Key bridge vars:
- `DEEPGRAM_API_KEY` — Required
- `INTERNAL_TOKEN` — Shared secret for client-bridge auth
- `N8N_TOOL_WEBHOOK_URL` — Webhook for external tools (optional)
- `DG_IDLE_TIMEOUT_MS` — Idle timeout before disconnecting Deepgram (default: 120000)
- `MEMORY_DIR` — Path for memory JSON files (default: `data/memory/`)

## Tech Stack

- TypeScript (strict), Node.js >=20
- `@deepgram/sdk` for Voice Agent API
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
