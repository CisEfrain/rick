# Environment Variables Reference

## TTS Server (`apps/tts-server`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3001` | HTTP/WS listen port (Railway auto-sets) |
| `DEEPGRAM_API_KEY` | **Yes** | — | Deepgram API key for TTS synthesis |
| `INTERNAL_TOKEN` | **Yes** | — | Shared secret for `/tts/*` auth + WS token |
| `DG_MODEL` | No | `aura-asteria-en` | Deepgram TTS model |
| `AUDIO_ENCODING` | No | `linear16` | Audio encoding: `linear16`, `mp3`, `opus` |
| `AUDIO_SAMPLE_RATE` | No | `16000` | Audio sample rate in Hz |
| `WS_BUFFER_LIMIT` | No | `5000000` | Backpressure threshold in bytes |

## Node Client (`apps/node-client`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `SESSION_ID` | No | `raspi-001` | Unique device/session identifier |
| `TTS_SERVER_WS_URL` | No | `ws://localhost:3001/ws` | TTS server WebSocket URL |
| `TTS_SERVER_HTTP_URL` | No | `http://localhost:3001` | TTS server HTTP URL (for direct text sends) |
| `N8N_WEBHOOK_URL` | No | — | n8n webhook URL for sending recorded audio |
| `TOKEN` | No | — | Same as `INTERNAL_TOKEN`, for WS auth |
| `INTERNAL_TOKEN` | No | — | For authenticating `/tts/*` requests from CLI |

## n8n

| Variable | Required | Description |
|---|---|---|
| `INTERNAL_TOKEN` | **Yes** | Must match tts-server's `INTERNAL_TOKEN` |
| `TTS_SERVER_URL` | **Yes** | Internal URL to tts-server (e.g. `http://tts-server.railway.internal:3001`) |
| Standard n8n vars | Yes | See [n8n docs](https://docs.n8n.io/hosting/configuration/environment-variables/) |
