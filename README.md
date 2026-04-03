# Rick — Voice Agent System

Asistente de voz en tiempo real con personalidad, memoria persistente y cuerpo fisico. Impulsado por Deepgram Voice Agent (STT + LLM + TTS). Corre en una Raspberry Pi con audio USB y se conecta a un bridge en la nube.

## Arquitectura

```
Usuario (microfono)
   |
   v
Node Client (Raspberry Pi)
   |  WebSocket (audio PCM 16kHz)
   v
Bridge (Node.js / Railway)
   |  WebSocket Voice Agent
   v
Deepgram (STT → LLM → TTS)
   |
   v
Bridge → Node Client → Parlante
```

## Quick Start

```bash
npm install
cp apps/bridge/.env.example apps/bridge/.env       # configurar DEEPGRAM_API_KEY, INTERNAL_TOKEN
cp apps/node-client/.env.example apps/node-client/.env  # configurar BRIDGE_WS_URL, TOKEN
npm run dev
```

Para setup completo en Raspberry Pi ver [docs/raspberry-pi-setup.md](docs/raspberry-pi-setup.md).

## Documentacion

| Documento | Descripcion |
|-----------|------------|
| [docs/functional.md](docs/functional.md) | Que hace Rick, como interactuar, memoria, comandos |
| [docs/constitution.md](docs/constitution.md) | Principios de diseno, arquitectura, decisiones tecnicas |
| [docs/raspberry-pi-setup.md](docs/raspberry-pi-setup.md) | Guia paso a paso para instalar en Raspberry Pi |
| [docs/hardware.md](docs/hardware.md) | Componentes, conexiones GPIO, cableado |
| [CLAUDE.md](CLAUDE.md) | Contexto tecnico para Claude Code |
| [infra/railway/](infra/railway/) | Deploy del bridge en Railway |
