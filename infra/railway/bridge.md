# Bridge — Railway Deploy

## Steps
1. **Create a new service** in Railway pulling from this monorepo.
2. Select the root folder.

## Build settings:
- **Root Directory**: `/`
- **Builder**: `Nixpacks` or `Dockerfile`
- **Build Command**: `npm ci && npm run build:bridge`
- **Start Command**: `node apps/bridge/dist/index.js`
- **Watch Paths**: `apps/bridge/**`

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `PORT` | Set automatically by Railway | `3000` |
| `DEEPGRAM_API_KEY` | Your Deepgram SDK/API Key | `...` |
| `INTERNAL_TOKEN` | Token checked when clients connect via WS | `secr3t!` |
| `N8N_TOOL_WEBHOOK_URL` | Webhook URL pointing to n8n (optional) | `https://n8n.../webhook/tool` |
| `DG_IDLE_TIMEOUT_MS` | Ms of inactivity before closing Deepgram session | `120000` |
| `MEMORY_DIR` | Path for persistent memory JSON files | `/data/memory` |

## Persistent Storage

Memory files (conversation history, user facts) need a persistent volume:

1. In Railway: Settings → Volumes → Add Volume
2. Mount path: `/data/memory`
3. Set env var: `MEMORY_DIR=/data/memory`

Without this, memory is lost on every deploy.
