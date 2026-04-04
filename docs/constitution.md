# Constitucion del Proyecto

## Rick V1 — Robot Interactivo con Voz y Movimiento

---

## 1. Vision del Sistema

Rick es un robot fisico interactivo que:

- Escucha mediante interaccion de voz (VAD automatico, PTT futuro)
- Procesa voz con IA (Deepgram STT + LLM + TTS)
- Responde con audio
- Expresa estados mediante pantalla (futuro)
- Puede moverse mediante traccion diferencial (futuro)

> **Filosofia clave:** Simple, robusto, incremental (agentic-ready)

---

## 2. Principios de Diseno

### 2.1 Simplicidad operativa

- Evitar AEC complejo (usar half-duplex por software)
- Evitar Bluetooth (cableado estable)
- Minimizar dependencias externas

### 2.2 Separacion de responsabilidades

| Capa | Responsabilidad |
|------|----------------|
| Hardware | Captura y salida fisica (mic, parlante, pantalla, motores) |
| Runtime local (Node.js) | Control, captura de audio, reproduccion, orquestacion |
| Bridge (Node.js) | Orquesta pipeline STT+LLM+TTS, gestion de sesiones, memoria, ejecucion de tools |
| IA | Deepgram Nova-3 (STT), OpenAI GPT (LLM + tools), Deepgram Aura-2 (TTS) |

### 2.3 Control determinista

- Estado siempre explicito
- No dependencia de VAD complejo en V1 (half-duplex por software)
- Futuro: boton fisico PTT para control directo

### 2.4 Evolucion modular

Rick esta disenado para evolucionar hacia:

- Multi-agente
- Percepcion contextual
- Autonomia fisica

---

## 3. Arquitectura General

```
Usuario (microfono)
   |  PCM 16kHz raw via arecord
   v
Node Client (Raspberry Pi)
   |  WebSocket (audio binario + JSON control)
   v
Bridge (Node.js / Railway) — Pipeline Orchestrator
   |
   ├── 1. STT: Deepgram Nova-3 (streaming WebSocket)
   |      Audio → transcripcion en tiempo real
   |
   ├── 2. LLM: OpenAI GPT (streaming HTTP + function calling)
   |      Transcripcion → respuesta texto (+ tools si necesita)
   |      Tools sincronicas: recordar, buscar_memoria, obtener_clima, obtener_hora
   |      Tools asincronicas: mover, poner_alarma (background queue + habla proactiva)
   |      Tools externas: ejecutar_n8n (HTTP POST a n8n)
   |
   └── 3. TTS: Deepgram Aura-2 (HTTP REST)
          Texto → audio PCM por oracion
   |
   v
Bridge -> Node Client -> Parlante
```

Para detalle de hardware ver [hardware.md](hardware.md). Para detalle funcional ver [functional.md](functional.md).

---

## 4. Modelo de Interaccion

### Half-duplex

> **Regla fundamental:** O escucha o habla, nunca ambos.

El microfono se silencia por software mientras Rick habla (`MUTE_MIC_WHILE_SPEAKING`). Esto evita que el parlante genere eco interpretado como habla del usuario.

### Maquina de estados

```
IDLE
 |
 v
LISTENING (VAD detecta voz / boton presionado en futuro)
 |
 v
PROCESSING (STT+LLM+TTS procesa)
 |
 v
SPEAKING (TTS reproduciendo)
 |
 v
IDLE
```

### Control futuro (boton PTT)

- Presionar -> iniciar captura
- Soltar -> procesar
- Presionar durante TTS -> interrumpir

---

## 5. Decisiones de Diseno

### Elegidas

- Raspberry Pi como unico cerebro local
- Half-duplex por software (mute mic durante TTS)
- Audio por cable USB (estable)
- Bridge en la nube (Railway) para no saturar la Pi
- Pipeline desacoplado STT+LLM+TTS (control total, costo ~$5-10/mes)
- Memoria persistente en JSON (Core Memory + Archival)
- Desconexion por inactividad (2 min) para ahorrar API
- Streaming sentence-level TTS (genera audio por oracion para baja latencia)

### Rechazadas

- Arduino como intermediario (complejidad innecesaria)
- Bluetooth audio (inestable)
- AEC por software complejo (half-duplex es suficiente)
- Microfonos analogicos (USB es plug-and-play)
- Full-duplex en V1 (requiere hardware AEC)
- Base de datos para memoria (JSON es suficiente en V1)
- Deepgram Voice Agent como pipeline unificado (costo $4.50/hr, vendor lock-in, control limitado del LLM)

---

## 6. Escalabilidad y Evolucion

### V1 completo cuando:

- Escucha y responde con voz
- Muestra estado en pantalla OLED
- Puede moverse
- Es portable
- Tiene memoria persistente

### Evoluciones futuras

- VAD automatico con barge-in real
- Mic array para localizacion de voz
- Navegacion autonoma
- Multi-agente IA
- Camara + vision
- Reconocimiento de voz por persona

---

## 7. Riesgos Identificados

| Riesgo | Mitigacion |
|--------|-----------|
| Eco del parlante | Half-duplex por software |
| Ruido electrico de motores | Bateria separada |
| Latencia de red | Bridge en Railway (baja latencia) |
| Complejidad creciente | Arquitectura modular |
| Costo de APIs (Deepgram + OpenAI) | Auto-desconexion STT por inactividad, pipeline desacoplado reduce costo 10x |
| Latencia del pipeline desacoplado | Streaming sentence-level TTS, LLM streaming |
| Perdida de memoria | JSON persistente con escritura atomica |
| Pi Zero lenta | Solo corre el cliente, bridge en la nube |
