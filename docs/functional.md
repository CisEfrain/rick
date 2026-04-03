# Rick — Guia Funcional

## Que es Rick

Rick es un asistente de voz con personalidad que vive en tu casa. Es simpatico, gracioso y un poco nerd. Habla en espanol y se adapta a quien le hable: con chicos es paciente y divertido, con adultos ajusta el tono.

Rick escucha a traves de un microfono, procesa la voz con inteligencia artificial (Deepgram + GPT-4o-mini), y responde por los parlantes con voz sintetizada.

---

## Como Interactuar

1. **Hablar naturalmente** — Rick usa deteccion automatica de voz (VAD). No hace falta apretar nada, simplemente habla.
2. **Escuchar la respuesta** — Rick responde por los parlantes. Mientras habla, el microfono se silencia automaticamente para evitar eco.
3. **Ahorro de API** — Si no hablas por 2 minutos, Rick se desconecta de Deepgram (deja de consumir creditos). Cuando volves a hablar, se reconecta automaticamente.
4. **Continuidad** — Al reconectar, Rick recuerda la conversacion reciente y no repite el saludo.

---

## Sistema de Memoria

Rick tiene memoria persistente en dos niveles.

### Memoria Central (Core Memory)

Datos que Rick SIEMPRE tiene presentes, inyectados en cada sesion:

- Nombre del usuario
- Datos personales (donde vive, edad, familia)
- Preferencias

Se guarda automaticamente cuando le decis algo como:
- "Me llamo Juan"
- "Vivo en Buenos Aires"
- "Recordá que mañana tengo reunión"

### Memoria de Archivo (Archival Memory)

Historial buscable de conversaciones pasadas y datos guardados:

- Ultimas 20 conversaciones guardadas automaticamente
- Datos explicitos que le pediste recordar
- Accesible cuando preguntas "¿que hablamos de X?"

### Como funciona

| Situacion | Que hace Rick |
|-----------|--------------|
| Le decis tu nombre | Llama la herramienta `recordar` y lo guarda en Core Memory |
| Le pedis "acordate de X" | Guarda X en Core Memory |
| Preguntas "¿que hablamos ayer?" | Llama `buscar_memoria` y busca en el historial |
| Se desconecta por inactividad | Guarda los mensajes de la sesion actual |
| Se reconecta | Carga Core Memory + ultima conversacion en el prompt |

---

## Comandos del Cliente

| Comando | Accion |
|---------|--------|
| `!stop` | Interrumpe la reproduccion de audio actual |
| `!quit` | Cierra el cliente (equivalente a Ctrl+C) |

---

## Estados del Robot

| Estado | Que pasa | UI OLED (futuro) |
|--------|----------|-----------------|
| IDLE | Esperando que alguien hable | Dormido |
| LISTENING | Deepgram detecto voz, escuchando | Escuchando |
| PROCESSING | Procesando respuesta con IA | Pensando |
| SPEAKING | Reproduciendo respuesta por parlante | Hablando |
| ERROR | Algo salio mal | Error |

---

## Flujo de Interaccion

```
Usuario habla al microfono
        |
        v
arecord captura audio PCM 16kHz
        |
        v
Node Client envia audio via WebSocket
        |
        v
Bridge recibe y reenvia a Deepgram Voice Agent
        |
        v
Deepgram: STT (Nova-3) → LLM (GPT-4o-mini) → TTS (Aura-2-Alvaro)
        |
        v
Bridge recibe audio de respuesta
        |
        v
Node Client reproduce por parlante (aplay)
        |
        v
Mic se reactiva despues de un delay
        |
        v
Vuelve a IDLE
```

Si el LLM necesita datos externos (memoria, herramientas), el bridge maneja la llamada localmente o via n8n.
