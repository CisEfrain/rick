# Rick — Voice Agent System

Asistente de voz en tiempo real impulsado por **Deepgram Voice Agent**. El micrófono captura audio en el dispositivo (Raspberry Pi o Windows), lo envía al bridge central, que lo procesa con Deepgram y devuelve audio de respuesta al cliente para reproducción por parlantes.

## Arquitectura

```text
Usuario (micrófono)
   ↓  PCM 16kHz raw via WebSocket
Node Client (Raspberry Pi / Windows)
   ↓  WebSocket (audio binario)
Bridge (Node.js / Railway)
   ↓  WebSocket Voice Agent Session
Deepgram Voice Agent (STT + LLM + TTS)
   ↓  FunctionCallRequest (si el agente necesita datos externos)
Bridge
   ↓  HTTP Webhook POST
n8n (ejecuta herramientas y devuelve JSON)
   ↑  FunctionCallResponse
Deepgram (continúa la respuesta con el contexto de la herramienta)
   ↑  Audio PCM binario
Bridge
   ↑  WebSocket (audio binario)
Node Client → Reproducción por parlantes
```

## Componentes

- **`apps/bridge`** — Servidor central. Gestiona la sesión WebSocket con Deepgram Voice Agent y la conexión con el cliente. Reenvía audio, maneja eventos del agente y ejecuta herramientas vía n8n. Bloquea el audio del micrófono mientras el agente habla para evitar eco.
- **`apps/node-client`** — Cliente de dispositivo (Raspberry Pi / Windows). Captura audio del micrófono con SoX (Windows) o arecord (Linux), lo envía al bridge en tiempo real, y reproduce el audio de respuesta por parlantes. Soporta mute automático mientras el agente habla.
- **`n8n`** — Motor de herramientas externo. Expone un webhook que el bridge invoca cuando Deepgram solicita una función (ej. clima, hora).
- **`infra/`** — Documentación de despliegue en Railway para el bridge.

## Quick Start

### 1. Instalar dependencias
```bash
npm install
```

### 2. Configurar variables de entorno

**Bridge** (`apps/bridge/.env`):
```env
DEEPGRAM_API_KEY=tu_api_key
INTERNAL_TOKEN=un_token_secreto
N8N_TOOL_WEBHOOK_URL=http://localhost:5678/webhook/tool
AGENT_AUDIO_DONE_DELAY_MS=1500
```

**Node Client** (`apps/node-client/.env`):
```env
SESSION_ID=raspi-001
BRIDGE_WS_URL=ws://localhost:3000
TOKEN=un_token_secreto
AUDIO_BACKEND=sox                # sox (Windows) o arecord (Linux/Raspi)
SOX_PATH=C:\ruta\a\sox.exe       # solo Windows
MUTE_MIC_WHILE_SPEAKING=true     # evita eco con parlantes; false con ReSpeaker HAT
```

### 3. Iniciar servidores de desarrollo
```bash
npm run dev
```

### 4. Uso
El cliente inicia la grabación automáticamente al arrancar. Habla directamente — Deepgram VAD detecta cuando hablás y cuando terminás. Rick responde por audio en los parlantes.

| Comando en cliente | Acción |
|---|---|
| `!stop` | Interrumpe la reproducción actual |
| `!quit` | Cierra el cliente |

## Scripts

| Comando | Descripción |
|---|---|
| `npm run dev` | Inicia bridge + cliente |
| `npm run dev:bridge` | Solo el bridge |
| `npm run dev:client` | Solo el cliente |
| `npm run build` | Compila ambas apps |

## Audio backends

| Plataforma | Backend | Notas |
|---|---|---|
| Windows | SoX | Requiere `SOX_PATH` apuntando a `sox.exe` |
| Raspberry Pi / Linux | arecord | Incluido en ALSA, sin instalación extra |

Para cancelación de eco por hardware se recomienda el **ReSpeaker 2-Mic HAT** o **ReSpeaker Lite USB** — en ese caso setear `MUTE_MIC_WHILE_SPEAKING=false`.

## API Endpoints (Bridge)

- `GET /health` — Health check.
