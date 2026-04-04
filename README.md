# Rick — Voice Agent System

Asistente de voz en tiempo real con personalidad, memoria persistente y cuerpo fisico. Pipeline desacoplado: Deepgram Nova-3 (STT) + OpenAI GPT (LLM) + Deepgram Aura-2 (TTS). Corre en una Raspberry Pi con audio USB y se conecta a un bridge orquestador en la nube.

## Arquitectura

```
Usuario (microfono)
   |
   v
Node Client (Raspberry Pi o Emulador)
   |  WebSocket (audio PCM 16kHz)
   v
Bridge (Node.js / Railway)
   |
   ├── Deepgram Nova-3 (STT streaming) → transcripcion
   ├── OpenAI GPT (LLM + function calling) → respuesta texto
   └── Deepgram Aura-2 (TTS) → audio respuesta
   |
   v
Bridge → Node Client → Parlante (o browser)
```

## Quick Start

```bash
npm install
cp apps/bridge/.env.example apps/bridge/.env       # configurar DEEPGRAM_API_KEY, OPENAI_API_KEY, INTERNAL_TOKEN
cp apps/node-client/.env.example apps/node-client/.env  # configurar BRIDGE_WS_URL, TOKEN
npm run dev
```

### Modo emulador (sin hardware)

```bash
npm run dev:emulator
# Abrir http://localhost:5173 en Chrome
```

Para mas detalles ver [docs/local-setup.md](docs/local-setup.md).
Para setup completo en Raspberry Pi ver [docs/raspberry-pi-setup.md](docs/raspberry-pi-setup.md).

## Documentacion

| Documento | Descripcion |
|-----------|------------|
| [docs/functional.md](docs/functional.md) | Que hace Rick, como interactuar, memoria, comandos |
| [docs/constitution.md](docs/constitution.md) | Principios de diseno, arquitectura, decisiones tecnicas |
| [docs/raspberry-pi-setup.md](docs/raspberry-pi-setup.md) | Guia paso a paso para instalar en Raspberry Pi |
| [docs/hardware.md](docs/hardware.md) | Componentes, conexiones GPIO, cableado |
| [docs/emulator.md](docs/emulator.md) | Emulador: arquitectura, adaptadores, componentes |
| [docs/local-setup.md](docs/local-setup.md) | Guia de inicio local con emulador |
| [docs/plan-v2.md](docs/plan-v2.md) | Plan de migracion a pipeline desacoplado (V2) |
| [CLAUDE.md](CLAUDE.md) | Contexto tecnico para Claude Code |
| [infra/railway/](infra/railway/) | Deploy del bridge en Railway |
