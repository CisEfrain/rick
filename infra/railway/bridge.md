# Bridge — Railway Deploy

## Steps
1. **Create a new service** in Railway pulling from this monorepo.
2. Select the root folder.

## Build settings:
- **Root Directory**: `/`
- **Builder**: `Nixpacks` or `Dockerfile`
- **Build Command**: `npm ci -w apps/bridge && npm run build:bridge`
- **Start Command**: `node apps/bridge/dist/index.js`
- **Watch Paths**: `apps/bridge/**`

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `PORT` | Set automatically by Railway | `3000` |
| `DEEPGRAM_API_KEY` | Deepgram API Key (for STT + TTS) | `...` |
| `OPENAI_API_KEY` | OpenAI API Key (for LLM) | `...` |
| `INTERNAL_TOKEN` | Token checked when clients connect via WS | `secr3t!` |
| `N8N_TOOL_WEBHOOK_URL` | Webhook URL pointing to n8n (optional) | `https://n8n.../webhook/tool` |
| `STT_MODEL` | Deepgram STT model | `nova-3` |
| `STT_LANGUAGE` | STT language code | `es` |
| `STT_IDLE_TIMEOUT_MS` | Ms of inactivity before closing STT session | `120000` |
| `LLM_MODEL` | OpenAI model name | `gpt-4o-mini` |
| `LLM_MAX_TOKENS` | Max response tokens | `300` |
| `LLM_TEMPERATURE` | LLM temperature | `0.8` |
| `TTS_MODEL` | Deepgram TTS voice model | `aura-2-es-alvaro` |
| `TTS_SAMPLE_RATE` | Audio sample rate for TTS output | `16000` |
| `WEATHER_API_KEY` | OpenWeatherMap API key (optional, for clima tool) | `...` |
| `MEMORY_DIR` | Path for persistent memory JSON files | `/data/memory` |

## Persistent Storage

Memory files (conversation history, user facts) need a persistent volume:

1. In Railway: Settings → Volumes → Add Volume
2. Mount path: `/data/memory`
3. Set env var: `MEMORY_DIR=/data/memory`

Without this, memory is lost on every deploy.
