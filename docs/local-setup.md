# Inicio Local con Emulador

Guia para levantar Rick localmente usando el emulador (sin Raspberry Pi ni hardware fisico).

---

## Prerequisitos

- **Node.js >= 20** ([descargar](https://nodejs.org))
- **Chrome** (u otro browser con soporte de `getUserMedia` y Web Audio API)
- **API keys** configuradas:
  - Deepgram: [console.deepgram.com](https://console.deepgram.com)
  - OpenAI: [platform.openai.com](https://platform.openai.com)

---

## Setup Rapido

### 1. Clonar e instalar

```bash
git clone <repo-url>
cd rick
npm install
```

### 2. Configurar variables de entorno

```bash
# Bridge (obligatorio)
cp apps/bridge/.env.example apps/bridge/.env
# Editar apps/bridge/.env:
#   DEEPGRAM_API_KEY=tu_key
#   OPENAI_API_KEY=tu_key
#   INTERNAL_TOKEN=un_token_seguro

# Node Client (obligatorio)
cp apps/node-client/.env.example apps/node-client/.env
# Editar apps/node-client/.env:
#   PLATFORM=emulator
#   TOKEN=un_token_seguro  (mismo que INTERNAL_TOKEN del bridge)
#   BRIDGE_WS_URL=ws://localhost:3000
```

### 3. Iniciar todo

**Opcion A: Script automatico**

```bash
./scripts/start-emulator.sh
```

El script verifica dependencias, archivos .env, y levanta los tres servicios.

**Opcion B: Comando npm**

```bash
npm run dev:emulator
```

**Opcion C: Manual (tres terminales)**

```bash
# Terminal 1 — Bridge
npm run dev:bridge

# Terminal 2 — Node Client (modo emulador)
PLATFORM=emulator npm run dev:client
# En Windows: set PLATFORM=emulator && npm run dev:client

# Terminal 3 — Frontend React
npm run dev:emulator-frontend
```

### 4. Abrir el emulador

Abrir **http://localhost:5173** en Chrome.

El browser va a pedir permiso para usar el microfono — aceptar.

---

## Que veo en la UI

- **Pantalla OLED**: replica de la pantalla del robot mostrando el estado actual
- **Indicador de Microfono**: muestra si el mic esta activo o mutado
- **Mapa del Robot**: posicion 2D que responde a comandos de motores
- **Logs**: eventos del sistema en tiempo real
- **Estado**: info de conexion y configuracion

---

## Puertos

| Servicio | Puerto | Protocolo |
|----------|--------|-----------|
| Bridge | 3000 | WebSocket + HTTP |
| Node Client → Browser | 3001 | WebSocket |
| Frontend React (Vite) | 5173 | HTTP |

---

## Troubleshooting

### El browser no captura audio
- Verificar que se acepto el permiso de microfono
- Chrome requiere HTTPS o localhost para `getUserMedia`
- Verificar que no hay otra app usando el microfono

### "Desconectado del Node Client"
- Verificar que el Node Client esta corriendo con `PLATFORM=emulator`
- Verificar que `FRONTEND_WS_PORT` coincide (default: 3001)

### No hay respuesta de Rick
- Verificar que el Bridge esta corriendo y las API keys son validas
- Verificar que `TOKEN` del client coincide con `INTERNAL_TOKEN` del bridge
- Revisar los logs del bridge para errores de Deepgram u OpenAI
