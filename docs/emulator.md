# Rick Emulator

## Que es el Emulador

El emulador permite desarrollar y probar Rick sin hardware fisico (Raspberry Pi, microfono USB, parlantes, pantalla OLED, motores). En su lugar, el browser actua como hardware: el microfono del browser captura audio, los parlantes del browser reproducen las respuestas, y una UI React muestra el estado del robot.

El emulador **no es un proyecto aparte**. Es el mismo Node Client que corre en la Pi, pero con adaptadores de hardware diferentes. La logica de negocio (protocolo WebSocket, half-duplex, idle timeout, reconexion) se comparte al 100%.

---

## Arquitectura

```
Browser (Chrome)                    Node Client                    Bridge (Railway)
┌─────────────┐     WebSocket      ┌──────────────┐    WebSocket   ┌──────────────┐
│ React UI     │◄──────────────────►│ Emulator     │◄─────────────►│ Pipeline     │
│              │     localhost:3001  │ Adapters     │  localhost:3000│ STT→LLM→TTS │
│ - Microfono  │                    │              │                │              │
│ - Parlantes  │                    │ RickClient   │                │              │
│ - OLED       │                    │ (logica      │                │              │
│ - Mapa robot │                    │  compartida) │                │              │
└─────────────┘                    └──────────────┘                └──────────────┘
```

- **Browser → Node Client**: audio PCM del microfono (binario), eventos PTT (JSON)
- **Node Client → Browser**: audio TTS para reproducir (binario), estado OLED, comandos de motores (JSON)
- **Node Client → Bridge**: identico a la Pi (audio PCM upstream, mensajes de control)
- **Bridge → Node Client**: identico a la Pi (audio TTS downstream, audio.start/end)

---

## Componentes del Frontend

| Componente | Funcion |
|-----------|---------|
| OLEDScreen | Replica la pantalla OLED 128x64 mostrando estado e icono |
| MicButton | Indicador del estado del microfono |
| RobotMap | Mapa 2D con posicion y trail del robot (reacciona a comandos de motores) |
| LogViewer | Log en tiempo real de eventos del sistema |
| ConnectionStatus | Estado de la conexion WebSocket al Node Client |

---

## Adaptadores del Emulador

Todos los adaptadores del emulador estan en `apps/node-client/src/adapters/emulator/` y comparten un unico servidor WebSocket (`FrontendWSServer`) que se comunica con el browser.

| Adaptador | Que reemplaza | Como funciona |
|-----------|--------------|---------------|
| `BrowserAudioInput` | arecord/sox | Recibe audio PCM del browser por WebSocket |
| `BrowserAudioOutput` | aplay/sox | Envia audio PCM al browser para reproduccion con Web Audio API |
| `BrowserDisplay` | Script Python + OLED | Envia estado JSON al browser para renderizar en canvas |
| `BrowserMotors` | GPIO + L298N | Envia comandos de movimiento al browser para visualizacion 2D |
| `BrowserButton` | GPIO + boton fisico | Escucha eventos PTT del browser (teclado/click) |
| `FakeTelemetry` | vcgencmd/proc | Retorna valores simulados de CPU, RAM, temperatura |

---

## Variables de Entorno

Las variables de entorno del emulador se configuran en `apps/node-client/.env`:

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `PLATFORM` | `raspi` | Setear a `emulator` para activar el modo emulador |
| `FRONTEND_WS_PORT` | `3001` | Puerto del WebSocket local entre Node Client y browser |

Todas las demas variables (BRIDGE_WS_URL, TOKEN, SESSION_ID, MUTE_MIC_WHILE_SPEAKING, etc.) funcionan igual que en la Pi.

---

## Como Agregar un Nuevo Adaptador

Para agregar soporte de hardware nuevo (ej: pantalla OLED real):

1. Crear el archivo en `apps/node-client/src/adapters/raspi/` implementando la interfaz correspondiente de `interfaces/`
2. Importarlo en `src/index.ts` dentro del bloque `if (PLATFORM === 'raspi')`
3. No es necesario tocar la logica de negocio en `client.ts`
