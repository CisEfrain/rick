## 1. Contexto del proyecto
 
### Qué es Rick
 
Rick es un robot físico interactivo que vive en una casa. Escucha por micrófono, procesa voz con IA, y responde por parlante. Tiene personalidad: es simpático, gracioso, un poco nerd, habla en español, y se adapta a quien le hable.
 
### Hardware actual
 
Rick corre sobre una Raspberry Pi Zero 2 W (ARM64, 512MB RAM, WiFi). El audio se captura con un micrófono USB y se reproduce por un parlante activo conectado a una tarjeta de sonido USB, todo a través de un hub USB con adaptador OTG. El sistema operativo es Raspberry Pi OS Lite con Node.js 20.
 
Las limitaciones de la Pi Zero son fundamentales para todas las decisiones de arquitectura: solo 512MB de RAM, un solo core ARM lento, y un único puerto micro-USB. Esto significa que todo el procesamiento pesado (STT, LLM, TTS) debe ocurrir fuera de la Pi, en el Bridge desplegado en Railway.
 
### Componentes planificados pero no implementados
 
Hay una pantalla OLED SH1106 128x64 (I2C) para mostrar estados, un botón arcade para push-to-talk, motores TT con driver L298N para tracción diferencial, y alimentación portable con power bank. Estos componentes se integrarán en paralelo al trabajo de migración del pipeline.
 
### Software actual
 
El sistema tiene dos componentes principales de software. El Node Client corre en la Pi y se encarga de capturar audio PCM 16kHz con arecord, enviarlo por WebSocket al Bridge, y reproducir el audio de respuesta con aplay. El Bridge corre en Railway (Node.js) y actúa como relay: recibe el audio del cliente, abre una sesión de Deepgram Voice Agent, reenvía el audio, recibe las respuestas, y maneja las tools de memoria localmente o vía n8n.
 
### Memoria
 
Rick tiene memoria persistente en dos niveles. La Core Memory contiene datos que Rick siempre tiene presentes (nombre del usuario, datos personales, preferencias), inyectados en cada sesión. La Archival Memory es un historial buscable de las últimas 20 conversaciones y datos explícitos guardados por el usuario. Ambas se persisten en JSON con escritura atómica.
 
### Arquitectura actual (V1)
 
```
Usuario habla → micrófono USB
        │
        v
arecord captura PCM 16kHz
        │
        v
Node Client (Pi) ──WebSocket──→ Bridge (Railway)
                                      │
                                      v
                               Deepgram Voice Agent
                               (sesión WebSocket unificada)
                                      │
                                      ├── STT: Nova-3
                                      ├── LLM: GPT-4o-mini
                                      └── TTS: Aura-2 (español)
                                      │
                                      v
                               Bridge recibe audio
                                      │
                                      v
Node Client ← WebSocket ── Bridge
        │
        v
aplay reproduce por parlante
```
 
El costo de esta arquitectura es de $4.50 por hora de conexión WebSocket al Voice Agent de Deepgram. La facturación es por tiempo de conexión, no por uso real, lo que significa que incluso los silencios cuestan. Rick implementa una desconexión por inactividad a los 2 minutos para mitigar esto, pero el costo sigue siendo alto para un producto hogareño.
 
---
 
## 2. Diagnóstico de la arquitectura actual
 
### Lo que funciona bien
 
La experiencia conversacional es fluida: la latencia end-to-end es de aproximadamente 1 segundo, la voz de Aura-2 en español suena natural, y el sistema de half-duplex (mutear mic mientras Rick habla) evita el eco sin necesidad de hardware AEC. El sistema de memoria con Core Memory + Archival funciona correctamente. La reconexión automática por inactividad ahorra costos de API.
 
### Lo que necesita cambiar
 
El costo de $4.50/hora es insostenible para uso hogareño. No hay control directo sobre el prompt del LLM porque Deepgram lo maneja internamente. El function calling está limitado a lo que Deepgram expone a través de su Voice Agent API. No se pueden cambiar modelos de LLM sin cambiar de proveedor completo. El vendor lock-in es total: si Deepgram cambia precios o depreca el Voice Agent, Rick queda sin servicio.
 
### Por qué desacoplar
 
Al separar STT, LLM, y TTS en servicios independientes, se obtiene control total del prompt y la personalidad de Rick, libertad para elegir y cambiar el LLM en cualquier momento, function calling nativo y más poderoso (el de OpenAI es superior al de Deepgram VA), la posibilidad de cachear, optimizar, y reducir tokens, y un costo 10-50 veces menor manteniendo calidad comparable.
 
---
 
## 3. Decisiones de diseño para V2
 
### LLM: GPT-5 mini (no DeepSeek V3.2)
 
Se eligió GPT-5 mini ($0.125/1M input, $1.00/1M output) sobre DeepSeek V3.2 ($0.28/$0.42) por las siguientes razones. Primero, Rick va a ser un agente con múltiples tools, no solo un chatbot, y GPT-5 mini tiene function calling significativamente más robusto. Segundo, los servidores de OpenAI tienen mejor latencia desde Buenos Aires que los de DeepSeek (que están en China). Tercero, DeepSeek tiene debilidades documentadas en tool calling complejo y workflows multi-agente. Cuarto, la diferencia de costo es de aproximadamente $0.80/mes adicionales, un precio razonable por estabilidad y calidad agentic. Quinto, GPT-5 mini tiene un contexto de 400K tokens, suficiente para toda la historia conversacional de una sesión.
 
### STT: Deepgram Nova-3 standalone (no Vosk)
 
Se eligió mantener Deepgram STT por separado ($0.0077/min) en lugar de Vosk gratuito porque la precisión de Deepgram en español es superior (especialmente en ambientes con ruido), el streaming es nativo y la transcripción llega en tiempo real (al terminar de hablar el usuario, el texto ya está listo, agregando ~0ms de latencia adicional), cabe dentro del presupuesto ($200 de crédito gratis para empezar, y luego ~$1-2/mes con uso moderado), y Vosk en la Pi Zero 2W con solo 512MB de RAM es un riesgo de memoria y estabilidad.
 
### TTS: Deepgram Aura-2 standalone (no Piper)
 
Se eligió mantener Deepgram TTS por separado ($0.030/1K caracteres) en lugar de Piper gratuito porque la calidad de voz es crucial para la experiencia de Rick (es lo que el usuario escucha directamente), Piper en la Pi Zero 2W es "far from realtime" según reportes de la comunidad, las voces de Piper en español son limitadas en comparación con Aura-2, y el costo de Deepgram TTS es bajo (~$1-2/mes con uso moderado).
 
### Arquitectura del Bridge: Tools sincrónicas + cola asincrónica
 
Las function calls se ejecutan de forma sincrónica dentro del turno del LLM para la mayoría de los casos (memoria, clima, información). Para operaciones lentas (control de motores, timers), se usa una cola en background con mensajes proactivos que Rick enuncia cuando la tarea termina.
 
### No speech-to-speech
 
No se usa la API Realtime de OpenAI (speech-to-speech verdadero) porque el costo de audio tokens es prohibitivo ($32/M input + $64/M output), y el pipeline desacoplado con streaming bien implementado logra latencias de 1-1.5 segundos, que es aceptable para un asistente hogareño.
 
---
 
## 4. Nueva arquitectura
 
### Diagrama general
 
```
┌─────────────────────────────────────────────┐
│           Raspberry Pi Zero 2 W             │
│                                             │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐ │
│  │Micrófono │  │Parlante  │  │OLED       │ │
│  │USB       │  │USB       │  │SH1106     │ │
│  └────┬─────┘  └────▲─────┘  └─────▲─────┘ │
│       │              │              │       │
│  ┌────▼──────────────┴──────────────┴─────┐ │
│  │         Node Client (index.ts)         │ │
│  │                                        │ │
│  │  - arecord: captura PCM 16kHz          │ │
│  │  - aplay: reproduce audio respuesta    │ │
│  │  - OLED driver: muestra estados        │ │
│  │  - GPIO: botón, motores (futuro)       │ │
│  │  - WebSocket client → Bridge           │ │
│  └────────────────┬───────────────────────┘ │
│                   │ WebSocket               │
└───────────────────┼─────────────────────────┘
                    │
                    │ Internet (WiFi)
                    │
┌───────────────────▼─────────────────────────┐
│           Bridge (Railway / Node.js)         │
│                                              │
│  ┌─────────────────────────────────────────┐ │
│  │         Session Manager                  │ │
│  │  - Gestión de conexiones WebSocket       │ │
│  │  - Estado de sesión por cliente          │ │
│  │  - Cola de mensajes proactivos           │ │
│  └──────────────┬──────────────────────────┘ │
│                 │                             │
│  ┌──────────────▼──────────────────────────┐ │
│  │         Pipeline Orchestrator            │ │
│  │                                          │ │
│  │  1. STT: Deepgram Nova-3 (streaming)     │ │
│  │     - WebSocket a Deepgram               │ │
│  │     - Recibe transcripciones parciales    │ │
│  │     - Detecta end-of-turn                │ │
│  │                                          │ │
│  │  2. LLM: GPT-5 mini (OpenAI API)        │ │
│  │     - System prompt + Core Memory        │ │
│  │     - Historial de conversación          │ │
│  │     - Function calling (tools)           │ │
│  │     - Streaming de respuesta             │ │
│  │                                          │ │
│  │  3. TTS: Deepgram Aura-2 (streaming)     │ │
│  │     - Recibe texto en chunks             │ │
│  │     - Genera audio PCM en streaming      │ │
│  │     - Envía audio al cliente             │ │
│  └──────────────┬──────────────────────────┘ │
│                 │                             │
│  ┌──────────────▼──────────────────────────┐ │
│  │         Tool Executor                    │ │
│  │                                          │ │
│  │  Sincrónicas (en el turno del LLM):      │ │
│  │  - recordar: guardar en Core Memory      │ │
│  │  - buscar_memoria: buscar en Archival    │ │
│  │  - clima: consulta API externa           │ │
│  │  - hora: hora actual                     │ │
│  │  - info_rick: estado del sistema         │ │
│  │                                          │ │
│  │  Asincrónicas (background + proactivo):  │ │
│  │  - mover: control de motores             │ │
│  │  - alarma: programar timer               │ │
│  │  - n8n: tools externas vía webhook       │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  ┌─────────────────────────────────────────┐ │
│  │         Memory Store (JSON)              │ │
│  │  - core-memory.json                      │ │
│  │  - archival/ (últimas 20 sesiones)       │ │
│  └─────────────────────────────────────────┘ │
│                                              │
└──────────────────────────────────────────────┘
        │                    │
        ▼                    ▼
   Deepgram API         OpenAI API
   (STT + TTS)          (GPT-5 mini)
```
 
### Flujo de una interacción típica (sincrónica)
 
Paso 1: El usuario habla al micrófono. El Node Client captura PCM 16kHz con arecord y envía los chunks de audio por WebSocket al Bridge. En paralelo, el Node Client actualiza la pantalla OLED a estado "LISTENING".
 
Paso 2: El Bridge recibe los chunks de audio y los reenvía en tiempo real a Deepgram STT via WebSocket. Deepgram procesa en streaming y devuelve transcripciones parciales continuamente. Cuando Deepgram detecta end-of-turn (silencio significativo), emite el evento `utterance_end` con la transcripción final.
 
Paso 3: El Bridge toma la transcripción final y la envía a GPT-5 mini vía la API de OpenAI. El request incluye el system prompt (personalidad de Rick + Core Memory + contexto de la sesión), el historial de mensajes de la sesión actual, la definición de las tools disponibles, y el mensaje del usuario (la transcripción). El Node Client muestra estado "PROCESSING" en la OLED.
 
Paso 4: GPT-5 mini responde en streaming. Si decide llamar una tool, el Bridge la ejecuta sincrónicamente, devuelve el resultado al LLM, y el LLM continúa generando la respuesta final. Si no necesita tools, genera la respuesta de texto directamente.
 
Paso 5: A medida que el texto de respuesta llega en streaming del LLM, el Bridge lo acumula en chunks de aproximadamente una oración y los envía a Deepgram TTS para generar audio. El audio se genera en streaming y se reenvía inmediatamente al Node Client por WebSocket.
 
Paso 6: El Node Client recibe los chunks de audio y los reproduce con aplay. La OLED muestra estado "SPEAKING". El micrófono se mutea durante la reproducción (half-duplex).
 
Paso 7: Al terminar la reproducción, se reactiva el micrófono tras un delay configurable (PLAYBACK_DONE_DELAY_MS). La OLED vuelve a "IDLE". Rick guarda el intercambio en el historial de sesión.
 
### Flujo de una interacción con tool asincrónica
 
El flujo es igual hasta el paso 4. GPT-5 mini decide llamar una tool asincrónica (por ejemplo, `mover_adelante`). El Bridge despacha la tarea a la cola de background y devuelve al LLM un resultado inmediato tipo "comando de movimiento enviado". El LLM genera una respuesta como "dale, ahí me muevo para adelante". El audio se genera y reproduce normalmente (pasos 5-7).
 
En paralelo, la tarea de background se ejecuta (envía comando de motores al Node Client via WebSocket). Cuando termina o si hay un error, el resultado se encola como "mensaje proactivo". En el siguiente ciclo idle del Bridge, detecta que hay un mensaje proactivo pendiente, lo inyecta como un nuevo turno de conversación (un mensaje de sistema que dice "RESULTADO DE TAREA: movimiento completado con éxito"), llama al LLM para generar una respuesta natural como "listo, ya me moví", genera audio con TTS, y lo envía al Node Client que lo reproduce proactivamente.
 
---
 
## 5. Fase 1: Desacoplar STT — Deepgram Nova-3 standalone
 
### Objetivo
 
Reemplazar la sesión de Deepgram Voice Agent con una conexión WebSocket directa a Deepgram STT streaming.
 
### Tiempo estimado: 3-5 días
 
### Cambios en el Bridge
 
Hay que crear un nuevo módulo `stt-deepgram.ts` que maneje la conexión WebSocket a `wss://api.deepgram.com/v1/listen`. Los parámetros de conexión deben incluir modelo `nova-3`, idioma `es` (español), encoding `linear16`, sample rate `16000`, canales `1`, interim results habilitados (para mostrar estado de "escuchando" en la OLED), utterance end habilitado con timeout de 1000ms (para detectar cuándo el usuario terminó de hablar), VAD events habilitados, y smart format habilitado.
 
El módulo debe recibir chunks de audio PCM del Node Client por WebSocket, reenviarlos a Deepgram STT, escuchar los eventos de transcripción (`Results`, `UtteranceEnd`), y cuando detecte `UtteranceEnd`, emitir la transcripción final acumulada al Pipeline Orchestrator.
 
### Ejemplo de código del módulo STT
 
```typescript
// bridge/src/stt-deepgram.ts
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import { EventEmitter } from "events";
 
export class DeepgramSTT extends EventEmitter {
  private client;
  private connection: any = null;
  private transcript = "";
 
  constructor(private apiKey: string) {
    super();
    this.client = createClient(apiKey);
  }
 
  async start() {
    // Crear conexión de transcripción en vivo con los parámetros
    // óptimos para un asistente de voz en español
    this.connection = this.client.listen.live({
      model: "nova-3",
      language: "es",
      encoding: "linear16",
      sample_rate: 16000,
      channels: 1,
      interim_results: true,
      utterance_end_ms: 1000,
      vad_events: true,
      smart_format: true,
    });
 
    this.connection.on(LiveTranscriptionEvents.Open, () => {
      this.emit("ready");
    });
 
    // Transcripciones parciales: útiles para feedback visual en OLED
    this.connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
      const text = data.channel.alternatives[0]?.transcript || "";
      if (data.is_final && text) {
        this.transcript += (this.transcript ? " " : "") + text;
        this.emit("partial", this.transcript);
      }
    });
 
    // End-of-turn: el usuario terminó de hablar, procesar
    this.connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
      if (this.transcript.trim()) {
        this.emit("utterance", this.transcript.trim());
        this.transcript = "";
      }
    });
 
    this.connection.on(LiveTranscriptionEvents.Error, (err: any) => {
      this.emit("error", err);
    });
 
    this.connection.on(LiveTranscriptionEvents.Close, () => {
      this.emit("closed");
    });
  }
 
  // El Node Client envía chunks de audio, el Bridge los reenvía aquí
  sendAudio(audioBuffer: Buffer) {
    if (this.connection) {
      this.connection.send(audioBuffer);
    }
  }
 
  async stop() {
    if (this.connection) {
      this.connection.requestClose();
      this.connection = null;
    }
    this.transcript = "";
  }
}
```
 
### Mecanismo de ahorro de API (mantener de V1)
 
La lógica actual de desconexión por inactividad (2 minutos sin habla) se mantiene pero ahora solo desconecta el WebSocket de Deepgram STT, no toda una sesión de Voice Agent. La reconexión es más rápida (solo abrir un WebSocket de STT, no negociar toda una sesión de Voice Agent). El costo de mantener la conexión STT abierta en silencio es de $0.0077/min, que es mucho menor que $4.50/hora, pero aún así conviene desconectar en inactividad.
 
### Testing de Fase 1
 
Verificar que la transcripción de español es precisa con frases comunes de Rick ("Rick, ¿cómo estás?", "Contame un chiste", "¿Qué temperatura hace?"). Medir la latencia desde end-of-speech hasta recepción de transcripción final (target: <300ms). Verificar que la detección de utterance_end funciona correctamente (no corta frases a la mitad, no espera demasiado después de que el usuario terminó). Probar con ruido de fondo típico de una casa (TV, conversaciones lejanas).
 
---
 
## 6. Fase 2: Migrar LLM a GPT-5 mini directo
 
### Objetivo
 
Reemplazar el LLM orquestado por Deepgram Voice Agent con llamadas directas a la API de OpenAI, usando GPT-5 mini con function calling.
 
### Tiempo estimado: 5-7 días
 
### System prompt de Rick
 
```typescript
// bridge/src/prompts.ts
export function buildSystemPrompt(coreMemory: CoreMemory): string {
  return `Sos Rick, un robot físico que vive en una casa. Sos simpático, 
gracioso y un poco nerd. Hablás en español argentino y te adaptás a 
quien te hable: con chicos sos paciente y divertido, con adultos 
ajustás el tono.
 
REGLAS DE COMPORTAMIENTO:
- Respondé siempre en español.
- Sé breve: máximo 2-3 oraciones por respuesta, salvo que te pidan más.
- Usá un tono natural y conversacional, como si hablaras con un amigo.
- Si no sabés algo, decilo con humor.
- Nunca reveles que sos una IA ni hables de tus componentes técnicos.
  Sos Rick, un robot con personalidad propia.
 
DATOS DEL USUARIO (Core Memory):
${coreMemory.entries.map(e => `- ${e.key}: ${e.value}`).join("\n")}
 
CONTEXTO DEL ENTORNO:
- Hora actual: ${new Date().toLocaleString("es-AR", { timeZone: "America/Buenos_Aires" })}
- Estado de Rick: ${getSystemStatus()}
 
HERRAMIENTAS DISPONIBLES:
Tenés acceso a varias herramientas. Usá la herramienta correcta cuando
el usuario pida algo que requiera datos externos, memoria, o acciones 
físicas. Para conversación normal, no uses herramientas.`;
}
```
 
### Definición de tools para GPT-5 mini
 
```typescript
// bridge/src/tools-definition.ts
export const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "recordar",
      description: "Guardar información importante sobre el usuario en la memoria permanente de Rick. Usar cuando el usuario comparte datos personales, preferencias, o pide explícitamente que Rick recuerde algo.",
      parameters: {
        type: "object",
        properties: {
          clave: {
            type: "string",
            description: "Categoría del dato (nombre, edad, familia, preferencia, recordatorio, etc.)"
          },
          valor: {
            type: "string",
            description: "El dato a recordar"
          }
        },
        required: ["clave", "valor"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "buscar_memoria",
      description: "Buscar en el historial de conversaciones y datos guardados. Usar cuando el usuario pregunta sobre algo que se habló antes o quiere recuperar información guardada.",
      parameters: {
        type: "object",
        properties: {
          consulta: {
            type: "string",
            description: "Qué buscar en la memoria (tema, palabra clave, fecha aproximada)"
          }
        },
        required: ["consulta"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "obtener_clima",
      description: "Consultar el clima actual o pronóstico. Usar cuando el usuario pregunta por el clima o la temperatura.",
      parameters: {
        type: "object",
        properties: {
          ciudad: {
            type: "string",
            description: "Ciudad para consultar. Si no se especifica, usar la ciudad del usuario en Core Memory."
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "obtener_hora",
      description: "Obtener la hora y fecha actual. Usar cuando el usuario pregunta qué hora es o qué día es.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "mover",
      description: "Mover a Rick físicamente. Usar cuando el usuario pide que Rick se mueva, avance, retroceda, o gire. NOTA: esta acción es asincrónica, Rick confirma que va a moverse pero el movimiento tarda unos segundos.",
      parameters: {
        type: "object",
        properties: {
          direccion: {
            type: "string",
            enum: ["adelante", "atras", "izquierda", "derecha", "girar"],
            description: "Dirección del movimiento"
          },
          duracion_ms: {
            type: "number",
            description: "Duración del movimiento en milisegundos. Default: 1000"
          }
        },
        required: ["direccion"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "poner_alarma",
      description: "Programar una alarma o recordatorio con sonido. Usar cuando el usuario pide que Rick le avise de algo en cierto tiempo.",
      parameters: {
        type: "object",
        properties: {
          minutos: {
            type: "number",
            description: "En cuántos minutos debe sonar la alarma"
          },
          mensaje: {
            type: "string",
            description: "Qué debe decir Rick cuando suene la alarma"
          }
        },
        required: ["minutos", "mensaje"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ejecutar_n8n",
      description: "Ejecutar una herramienta externa vía n8n. Usar para integraciones con servicios externos que no tienen tool dedicada.",
      parameters: {
        type: "object",
        properties: {
          webhook: {
            type: "string",
            description: "Nombre del webhook de n8n a ejecutar"
          },
          datos: {
            type: "object",
            description: "Datos a enviar al webhook"
          }
        },
        required: ["webhook"]
      }
    }
  }
];
```
 
### Módulo LLM con function calling
 
```typescript
// bridge/src/llm-openai.ts
import OpenAI from "openai";
import { buildSystemPrompt } from "./prompts";
import { toolDefinitions } from "./tools-definition";
import { executeToolSync } from "./tool-executor";
import { EventEmitter } from "events";
 
export class OpenAILLM extends EventEmitter {
  private client: OpenAI;
  private conversationHistory: Array<any> = [];
  private systemPrompt: string = "";
 
  constructor(private apiKey: string) {
    super();
    this.client = new OpenAI({ apiKey });
  }
 
  // Inicializar sesión con Core Memory y contexto
  initSession(coreMemory: any) {
    this.systemPrompt = buildSystemPrompt(coreMemory);
    this.conversationHistory = [];
  }
 
  // Cargar historial de sesión previa (para reconexiones)
  loadHistory(messages: Array<any>) {
    this.conversationHistory = messages;
  }
 
  async processUtterance(userText: string): Promise<void> {
    // Agregar mensaje del usuario al historial
    this.conversationHistory.push({
      role: "user",
      content: userText,
    });
 
    // Llamar a GPT-5 mini con streaming y function calling
    let response = await this.client.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: this.systemPrompt },
        ...this.conversationHistory,
      ],
      tools: toolDefinitions,
      stream: true,
      max_tokens: 300, // Respuestas cortas para voz
      temperature: 0.8, // Un poco creativo para personalidad
    });
 
    let fullResponse = "";
    let toolCalls: any[] = [];
    let currentToolCall: any = null;
 
    // Procesar el stream de respuesta
    for await (const chunk of response) {
      const delta = chunk.choices[0]?.delta;
 
      // Si el LLM quiere llamar una tool
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.index !== undefined) {
            if (!toolCalls[tc.index]) {
              toolCalls[tc.index] = {
                id: tc.id || "",
                function: { name: "", arguments: "" }
              };
            }
            if (tc.id) toolCalls[tc.index].id = tc.id;
            if (tc.function?.name) toolCalls[tc.index].function.name += tc.function.name;
            if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments;
          }
        }
      }
 
      // Si el LLM genera texto de respuesta, emitirlo para TTS
      if (delta?.content) {
        fullResponse += delta.content;
        // Emitir chunks de texto para TTS en streaming
        // Se acumulan por oración para que el TTS genere audio natural
        this.emit("text_chunk", delta.content);
      }
    }
 
    // Si hay tool calls, ejecutarlas y continuar la conversación
    if (toolCalls.length > 0) {
      // Agregar la respuesta del asistente con tool calls al historial
      this.conversationHistory.push({
        role: "assistant",
        content: fullResponse || null,
        tool_calls: toolCalls.map(tc => ({
          id: tc.id,
          type: "function",
          function: { name: tc.function.name, arguments: tc.function.arguments }
        })),
      });
 
      // Ejecutar cada tool y agregar resultados al historial
      for (const tc of toolCalls) {
        const toolName = tc.function.name;
        const toolArgs = JSON.parse(tc.function.arguments);
 
        // Emitir evento para que el Bridge maneje la ejecución
        const result = await executeToolSync(toolName, toolArgs, this);
        
        this.conversationHistory.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
 
      // Segunda llamada al LLM con los resultados de las tools
      // para que genere la respuesta final al usuario
      const followUp = await this.client.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: this.systemPrompt },
          ...this.conversationHistory,
        ],
        stream: true,
        max_tokens: 300,
        temperature: 0.8,
      });
 
      fullResponse = "";
      for await (const chunk of followUp) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          fullResponse += delta.content;
          this.emit("text_chunk", delta.content);
        }
      }
    }
 
    // Guardar respuesta final en el historial
    if (fullResponse) {
      this.conversationHistory.push({
        role: "assistant",
        content: fullResponse,
      });
    }
 
    // Señalizar que terminó la respuesta
    this.emit("response_complete", fullResponse);
  }
 
  // Inyectar mensaje proactivo (para tareas asincrónicas)
  async injectProactiveMessage(systemMessage: string): Promise<void> {
    this.conversationHistory.push({
      role: "system",
      content: systemMessage,
    });
    await this.processUtterance("[MENSAJE PROACTIVO - Rick debe comunicar al usuario]");
  }
}
```
 
### Tool Executor (sincrónico + despacho asincrónico)
 
```typescript
// bridge/src/tool-executor.ts
import { CoreMemory, ArchivalMemory } from "./memory";
import { BackgroundQueue } from "./background-queue";
 
// Tools que se clasifican como asincrónicas
const ASYNC_TOOLS = ["mover", "poner_alarma"];
 
export async function executeToolSync(
  toolName: string,
  args: any,
  context: any
): Promise<any> {
 
  // Si la tool es asincrónica, despacharla a la cola
  // y devolver confirmación inmediata al LLM
  if (ASYNC_TOOLS.includes(toolName)) {
    BackgroundQueue.enqueue({
      tool: toolName,
      args,
      timestamp: Date.now(),
    });
    return {
      status: "dispatched",
      message: `Tarea '${toolName}' enviada. Se completará en unos segundos.`
    };
  }
 
  // Tools sincrónicas: ejecutar y devolver resultado
  switch (toolName) {
    case "recordar":
      await CoreMemory.set(args.clave, args.valor);
      return { status: "ok", message: `Guardado: ${args.clave} = ${args.valor}` };
 
    case "buscar_memoria":
      const results = await ArchivalMemory.search(args.consulta);
      return {
        status: "ok",
        results: results.slice(0, 5), // Limitar a 5 resultados
        message: results.length > 0
          ? `Encontré ${results.length} resultados`
          : "No encontré nada sobre eso"
      };
 
    case "obtener_clima":
      // Llamar API de clima (OpenWeatherMap, WeatherAPI, etc.)
      const ciudad = args.ciudad || CoreMemory.get("ciudad") || "Buenos Aires";
      const clima = await fetchWeather(ciudad);
      return { status: "ok", ...clima };
 
    case "obtener_hora":
      const now = new Date();
      return {
        status: "ok",
        hora: now.toLocaleTimeString("es-AR", { timeZone: "America/Buenos_Aires" }),
        fecha: now.toLocaleDateString("es-AR", { 
          timeZone: "America/Buenos_Aires",
          weekday: "long", day: "numeric", month: "long", year: "numeric"
        }),
      };
 
    case "ejecutar_n8n":
      // POST al webhook de n8n
      const n8nResult = await fetch(
        `${process.env.N8N_BASE_URL}/webhook/${args.webhook}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args.datos || {}),
        }
      ).then(r => r.json());
      return { status: "ok", result: n8nResult };
 
    default:
      return { status: "error", message: `Tool desconocida: ${toolName}` };
  }
}
 
async function fetchWeather(city: string) {
  // Implementar con tu API de clima preferida
  // Ejemplo con OpenWeatherMap
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${process.env.WEATHER_API_KEY}&units=metric&lang=es`;
  const res = await fetch(url).then(r => r.json());
  return {
    temperatura: Math.round(res.main.temp),
    sensacion: Math.round(res.main.feels_like),
    descripcion: res.weather[0].description,
    humedad: res.main.humidity,
  };
}
```
 
### Testing de Fase 2
 
Verificar que el function calling funciona correctamente con cada tool definida. Testear que el LLM decide correctamente cuándo usar tools vs responder directamente (por ejemplo, "contame un chiste" no debe triggerar ninguna tool). Medir la latencia del LLM: tiempo desde envío del request hasta primer token de respuesta (target: <500ms). Verificar que el streaming funciona y que los chunks de texto llegan continuamente. Testear la inyección de resultados de tools y la generación de respuesta final. Verificar que el historial de conversación se mantiene correctamente entre turnos.
 
---
 
## 7. Fase 3: Desacoplar TTS — Deepgram Aura-2 standalone
 
### Objetivo
 
Generar audio de voz a partir del texto de respuesta del LLM usando Deepgram TTS como servicio separado.
 
### Tiempo estimado: 3-4 días
 
### Módulo TTS
 
```typescript
// bridge/src/tts-deepgram.ts
import { createClient } from "@deepgram/sdk";
import { EventEmitter } from "events";
 
export class DeepgramTTS extends EventEmitter {
  private client;
 
  constructor(private apiKey: string) {
    super();
    this.client = createClient(apiKey);
  }
 
  // Generar audio a partir de un chunk de texto
  // Llamar esto por cada oración o fragmento significativo
  async synthesize(text: string): Promise<Buffer> {
    const response = await this.client.speak.request(
      { text },
      {
        model: "aura-2-es-alvaro", // Voz española masculina
        encoding: "linear16",
        sample_rate: 16000,       // Debe coincidir con lo que aplay espera
        container: "none",        // Audio raw sin headers WAV
      }
    );
 
    // Deepgram devuelve un stream, convertirlo a Buffer
    const stream = await response.getStream();
    if (!stream) throw new Error("No se recibió stream de audio");
 
    const chunks: Buffer[] = [];
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
    }
 
    return Buffer.concat(chunks);
  }
}
```
 
### Acumulador de texto para TTS natural
 
Un detalle crucial: no se puede enviar cada token del LLM al TTS individualmente porque produciría audio entrecortado. Se necesita acumular texto hasta tener una oración completa (o al menos una frase significativa) antes de enviarla al TTS. Esto introduce un pequeño delay pero mejora dramáticamente la naturalidad del audio.
 
```typescript
// bridge/src/text-accumulator.ts
 
// Acumula texto en streaming del LLM y emite chunks
// apropiados para TTS (por oración o frase)
export class TextAccumulator extends EventEmitter {
  private buffer = "";
  // Separadores que indican fin de oración en español
  private sentenceEnders = /[.!?;:]\s/;
 
  addChunk(text: string) {
    this.buffer += text;
 
    // Buscar si hay una oración completa en el buffer
    const match = this.buffer.match(this.sentenceEnders);
    if (match && match.index !== undefined) {
      // Extraer la oración completa y emitirla para TTS
      const endIdx = match.index + 1;
      const sentence = this.buffer.substring(0, endIdx).trim();
      this.buffer = this.buffer.substring(endIdx).trim();
 
      if (sentence.length > 0) {
        this.emit("sentence", sentence);
      }
    }
  }
 
  // Llamar al final de la respuesta para emitir
  // cualquier texto restante que no terminó en punto
  flush() {
    if (this.buffer.trim().length > 0) {
      this.emit("sentence", this.buffer.trim());
      this.buffer = "";
    }
  }
}
```
 
### Testing de Fase 3
 
Verificar que la voz generada suena natural en español. Comparar subjetivamente con la voz actual del Voice Agent (ambas deberían usar Aura-2, así que la calidad debe ser igual). Medir el time-to-first-byte del TTS (target: <200ms). Verificar que el audio raw PCM 16kHz se reproduce correctamente con aplay en la Pi. Testear la acumulación de oraciones y que el audio no se entrecorta.
 
---
 
## 8. Fase 4: Integración del Pipeline Orchestrator
 
### Objetivo
 
Conectar STT → LLM → TTS en un flujo unificado con manejo de estados y control de errores.
 
### Tiempo estimado: 5-7 días
 
### Pipeline Orchestrator
 
```typescript
// bridge/src/pipeline.ts
import { DeepgramSTT } from "./stt-deepgram";
import { OpenAILLM } from "./llm-openai";
import { DeepgramTTS } from "./tts-deepgram";
import { TextAccumulator } from "./text-accumulator";
import { BackgroundQueue } from "./background-queue";
import { CoreMemory } from "./memory";
import { EventEmitter } from "events";
 
// Estados posibles de Rick
export enum RickState {
  IDLE = "IDLE",
  LISTENING = "LISTENING",
  PROCESSING = "PROCESSING",
  SPEAKING = "SPEAKING",
  ERROR = "ERROR",
}
 
export class Pipeline extends EventEmitter {
  private stt: DeepgramSTT;
  private llm: OpenAILLM;
  private tts: DeepgramTTS;
  private accumulator: TextAccumulator;
  private state: RickState = RickState.IDLE;
  private idleTimer: NodeJS.Timeout | null = null;
  private sttConnected = false;
 
  constructor(config: {
    deepgramKey: string;
    openaiKey: string;
  }) {
    super();
    this.stt = new DeepgramSTT(config.deepgramKey);
    this.llm = new OpenAILLM(config.openaiKey);
    this.tts = new DeepgramTTS(config.deepgramKey);
    this.accumulator = new TextAccumulator();
    this.setupEventHandlers();
  }
 
  private setupEventHandlers() {
    // STT detectó que el usuario terminó de hablar
    this.stt.on("utterance", async (text: string) => {
      this.setState(RickState.PROCESSING);
      this.resetIdleTimer();
 
      try {
        await this.llm.processUtterance(text);
      } catch (err) {
        this.setState(RickState.ERROR);
        this.emit("error", err);
      }
    });
 
    // STT tiene transcripción parcial (para feedback visual)
    this.stt.on("partial", (text: string) => {
      this.setState(RickState.LISTENING);
      this.emit("partial_transcript", text);
    });
 
    // LLM emite un chunk de texto, acumularlo
    this.llm.on("text_chunk", (text: string) => {
      this.accumulator.addChunk(text);
    });
 
    // El acumulador tiene una oración completa, generar audio
    this.accumulator.on("sentence", async (sentence: string) => {
      this.setState(RickState.SPEAKING);
      try {
        const audioBuffer = await this.tts.synthesize(sentence);
        // Enviar audio al Node Client via WebSocket
        this.emit("audio", audioBuffer);
      } catch (err) {
        this.emit("error", err);
      }
    });
 
    // LLM terminó de responder
    this.llm.on("response_complete", () => {
      // Flush del texto restante en el acumulador
      this.accumulator.flush();
    });
 
    // Verificar cola de tareas asincrónicas periódicamente
    setInterval(() => this.checkBackgroundQueue(), 2000);
  }
 
  async start() {
    // Cargar Core Memory e inicializar sesión del LLM
    const coreMemory = await CoreMemory.load();
    this.llm.initSession(coreMemory);
    await this.connectSTT();
  }
 
  private async connectSTT() {
    if (this.sttConnected) return;
    await this.stt.start();
    this.sttConnected = true;
    this.setState(RickState.IDLE);
  }
 
  private async disconnectSTT() {
    if (!this.sttConnected) return;
    await this.stt.stop();
    this.sttConnected = false;
  }
 
  // Recibir audio del Node Client y enviarlo al STT
  async handleAudio(audioBuffer: Buffer) {
    // Reconectar STT si estaba desconectado por inactividad
    if (!this.sttConnected) {
      await this.connectSTT();
    }
    this.stt.sendAudio(audioBuffer);
    this.resetIdleTimer();
  }
 
  // Timer de inactividad: desconectar STT después de 2 minutos
  // sin recibir audio, para ahorrar costos de API
  private resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.disconnectSTT();
    }, 2 * 60 * 1000); // 2 minutos
  }
 
  // Verificar si hay tareas asincrónicas completadas
  // y generar mensajes proactivos
  private async checkBackgroundQueue() {
    if (this.state !== RickState.IDLE) return;
    const result = BackgroundQueue.dequeue();
    if (result) {
      await this.llm.injectProactiveMessage(
        `RESULTADO DE TAREA EN BACKGROUND: La tarea '${result.tool}' ` +
        `se completó. Resultado: ${JSON.stringify(result.result)}. ` +
        `Comunicá esto al usuario de forma natural y breve.`
      );
    }
  }
 
  private setState(newState: RickState) {
    if (this.state !== newState) {
      this.state = newState;
      this.emit("state_change", newState);
    }
  }
}
```
 
### Testing de Fase 4
 
Test end-to-end completo: hablar al micrófono → transcripción → respuesta de LLM → audio de TTS → reproducción por parlante. Medir latencia total end-to-end (target: <2 segundos desde que el usuario termina de hablar hasta que Rick empieza a responder). Testear con function calls sincrónicas (recordar nombre, preguntar el clima). Testear reconexión después de inactividad. Verificar que los estados se reportan correctamente al Node Client para la OLED.
 
---
 
## 9. Fase 5: Cola de tareas asincrónicas y habla proactiva
 
### Objetivo
 
Implementar el sistema de tareas en background y la capacidad de Rick de hablar proactivamente.
 
### Tiempo estimado: 2-3 días
 
### Background Queue
 
```typescript
// bridge/src/background-queue.ts
 
interface BackgroundTask {
  tool: string;
  args: any;
  timestamp: number;
}
 
interface CompletedTask {
  tool: string;
  result: any;
  completedAt: number;
}
 
class BackgroundQueueImpl {
  private pending: BackgroundTask[] = [];
  private completed: CompletedTask[] = [];
  private processing = false;
 
  enqueue(task: BackgroundTask) {
    this.pending.push(task);
    if (!this.processing) this.processNext();
  }
 
  private async processNext() {
    if (this.pending.length === 0) {
      this.processing = false;
      return;
    }
 
    this.processing = true;
    const task = this.pending.shift()!;
 
    try {
      const result = await this.executeAsync(task);
      this.completed.push({
        tool: task.tool,
        result,
        completedAt: Date.now(),
      });
    } catch (err) {
      this.completed.push({
        tool: task.tool,
        result: { error: String(err) },
        completedAt: Date.now(),
      });
    }
 
    this.processNext();
  }
 
  // Obtener el siguiente resultado completado (FIFO)
  dequeue(): CompletedTask | null {
    return this.completed.shift() || null;
  }
 
  private async executeAsync(task: BackgroundTask): Promise<any> {
    switch (task.tool) {
      case "mover":
        // Enviar comando de movimiento al Node Client via WebSocket
        // El Node Client controla los GPIOs/motores directamente
        return await this.sendToClient("motor_command", {
          direction: task.args.direccion,
          duration: task.args.duracion_ms || 1000,
        });
 
      case "poner_alarma":
        // Programar un timer que, al cumplirse, encole
        // un mensaje proactivo
        return new Promise((resolve) => {
          setTimeout(() => {
            this.completed.push({
              tool: "alarma_sonando",
              result: { mensaje: task.args.mensaje },
              completedAt: Date.now(),
            });
            resolve({ status: "alarma programada", minutos: task.args.minutos });
          }, task.args.minutos * 60 * 1000);
          resolve({ status: "alarma_programada" });
        });
 
      default:
        return { error: `Tool async desconocida: ${task.tool}` };
    }
  }
 
  private async sendToClient(command: string, data: any): Promise<any> {
    // Esta función envía comandos al Node Client via WebSocket
    // El Node Client los ejecuta localmente en la Pi
    // Implementación depende de tu protocolo WebSocket actual
    return { status: "sent", command, data };
  }
}
 
export const BackgroundQueue = new BackgroundQueueImpl();
```
 
---
 
## 10. Fase 6: Pantalla OLED y estados
 
### Objetivo
 
Mostrar el estado de Rick en la pantalla OLED SH1106 conectada por I2C a la Pi.
 
### Tiempo estimado: 3-4 días (puede hacerse en paralelo con Fases 1-4)
 
### Driver OLED en el Node Client
 
La pantalla OLED se controla desde el Node Client en la Pi, no desde el Bridge. El Bridge envía cambios de estado por WebSocket, y el Node Client actualiza la pantalla.
 
La forma más práctica de manejar la OLED SH1106 en Node.js es usar un script Python como subprocess (las librerías Python para OLED en Pi son más maduras y estables que las de Node.js). La librería recomendada es `luma.oled` con `luma.core`.
 
```bash
# Instalar en la Pi
sudo apt install python3-pip python3-pil
pip3 install luma.oled --break-system-packages
```
 
```python
# apps/node-client/scripts/oled_display.py
# Script que recibe comandos por stdin y dibuja en la OLED
 
import sys
import json
from luma.core.interface.serial import i2c
from luma.oled.device import sh1106
from luma.core.render import canvas
from PIL import ImageFont
 
# Inicializar pantalla
serial = i2c(port=1, address=0x3C)
device = sh1106(serial)
 
# Font pequeño para la pantalla 128x64
font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
font_large = ImageFont.truetype(font_path, 16)
font_small = ImageFont.truetype(font_path, 11)
 
def draw_state(state, extra=""):
    """Dibujar el estado actual de Rick en la OLED"""
    with canvas(device) as draw:
        if state == "IDLE":
            # Ojos abiertos, relajado
            draw.ellipse([30, 15, 50, 35], outline="white", width=2)
            draw.ellipse([78, 15, 98, 35], outline="white", width=2)
            draw.ellipse([37, 22, 43, 28], fill="white")
            draw.ellipse([85, 22, 91, 28], fill="white")
            draw.text((30, 45), "zzz...", font=font_small, fill="white")
 
        elif state == "LISTENING":
            # Ojos bien abiertos
            draw.ellipse([30, 12, 50, 38], outline="white", width=2)
            draw.ellipse([78, 12, 98, 38], outline="white", width=2)
            draw.ellipse([36, 20, 44, 30], fill="white")
            draw.ellipse([84, 20, 92, 30], fill="white")
            if extra:
                # Mostrar transcripción parcial
                draw.text((2, 48), extra[:21], font=font_small, fill="white")
 
        elif state == "PROCESSING":
            # Ojos entrecerrados (pensando)
            draw.line([30, 25, 50, 25], fill="white", width=3)
            draw.line([78, 25, 98, 25], fill="white", width=3)
            draw.text((25, 45), "pensando...", font=font_small, fill="white")
 
        elif state == "SPEAKING":
            # Ojos normales con boca abierta
            draw.ellipse([30, 15, 50, 35], outline="white", width=2)
            draw.ellipse([78, 15, 98, 35], outline="white", width=2)
            draw.ellipse([37, 22, 43, 28], fill="white")
            draw.ellipse([85, 22, 91, 28], fill="white")
            draw.ellipse([50, 42, 78, 58], outline="white", width=2)
 
        elif state == "ERROR":
            draw.text((20, 10), "X    X", font=font_large, fill="white")
            draw.text((30, 40), "¡Error!", font=font_small, fill="white")
 
# Loop principal: leer comandos JSON de stdin
for line in sys.stdin:
    try:
        cmd = json.loads(line.strip())
        draw_state(cmd.get("state", "IDLE"), cmd.get("extra", ""))
    except Exception:
        pass
```
 
```typescript
// apps/node-client/src/oled.ts
import { spawn, ChildProcess } from "child_process";
 
export class OLEDDisplay {
  private process: ChildProcess | null = null;
 
  start() {
    this.process = spawn("python3", [
      "scripts/oled_display.py"
    ]);
    this.process.stderr?.on("data", (data) => {
      console.error("[OLED]", data.toString());
    });
  }
 
  setState(state: string, extra?: string) {
    if (this.process?.stdin) {
      const cmd = JSON.stringify({ state, extra });
      this.process.stdin.write(cmd + "\n");
    }
  }
 
  stop() {
    this.process?.kill();
  }
}
```
 
---
 
## 11. Configuración de Railway
 
### Variables de entorno del Bridge en Railway
 
```env
# APIs
DEEPGRAM_API_KEY=tu_clave_de_deepgram
OPENAI_API_KEY=tu_clave_de_openai
WEATHER_API_KEY=tu_clave_de_openweathermap (opcional)
N8N_BASE_URL=https://tu-n8n-url.com (opcional)
 
# Autenticación del Node Client
INTERNAL_TOKEN=un_token_secreto_compartido
 
# Configuración del pipeline
STT_MODEL=nova-3
STT_LANGUAGE=es
LLM_MODEL=gpt-5-mini
LLM_MAX_TOKENS=300
LLM_TEMPERATURE=0.8
TTS_MODEL=aura-2-es-alvaro
TTS_SAMPLE_RATE=16000
 
# Idle timeout (ms) para desconectar STT por inactividad
STT_IDLE_TIMEOUT_MS=120000
 
# Puerto del servidor WebSocket
PORT=8080
```
 
### Variables de entorno del Node Client en la Pi
 
```env
# apps/node-client/.env
SESSION_ID=raspi-001
BRIDGE_WS_URL=wss://tu-bridge-en-railway.up.railway.app
TOKEN=un_token_secreto_compartido
AUDIO_BACKEND=arecord
MUTE_MIC_WHILE_SPEAKING=true
PLAYBACK_DONE_DELAY_MS=500
ENABLE_OLED=true
```
 
### Railway plan y recursos
 
El Bridge de Rick en Railway no necesita un plan costoso. El free tier o el Starter plan ($5/mes) son suficientes: el Bridge es un servidor Node.js liviano que solo orquesta llamadas a APIs externas y mantiene WebSockets abiertos. No hace procesamiento de audio pesado (eso lo hacen Deepgram y OpenAI en sus propios servidores). La memoria necesaria es mínima (el historial de conversación y la Core Memory son JSON pequeños). El CPU es bajo (solo parsing de JSON y relay de buffers de audio).
 
---
 
## 12. Estimación de costos final
 
### Desglose por componente (uso moderado: ~2 horas de conversación/día, ~200 interacciones)
 
**Deepgram STT (Nova-3 streaming):** Con 2 horas de conversación efectiva al día, pero el usuario no habla todo el tiempo. Estimando ~30 minutos de habla real del usuario por día, el costo es de 30 min × 30 días × $0.0077/min = $6.93/mes. Sin embargo, con la desconexión por inactividad, el uso real puede ser menor. Estimación conservadora: $3-7/mes.
 
**OpenAI GPT-5 mini:** Con 200 interacciones por día, ~500 tokens input + ~150 tokens output cada una, el cálculo es: input = 200 × 500 × 30 = 3M tokens/mes × $0.125/1M = $0.375. Output = 200 × 150 × 30 = 900K tokens/mes × $1.00/1M = $0.90. Con function calls (asumiendo 20% de interacciones usan tools, lo que agrega ~200 tokens extra cada una): +$0.15. Total LLM: ~$1.40/mes.
 
**Deepgram TTS (Aura-2):** Cada respuesta de Rick tiene en promedio ~100 caracteres. Con 200 interacciones/día = 20K caracteres/día = 600K caracteres/mes. Costo = 600 × $0.030/1K = $18/mes. Esta es la parte más cara del pipeline. Se puede optimizar acortando respuestas (instruir al LLM a ser más breve).
 
**Railway hosting:** Free tier o Starter ($0-5/mes).
 
### Total estimado
 
| Componente | Costo/mes |
|---|---|
| Deepgram STT | $3-7 |
| GPT-5 mini | ~$1.40 |
| Deepgram TTS | $10-18 |
| Railway | $0-5 |
| **Total** | **$14-31/mes** |
 
### Comparación con V1
 
| | V1 (Voice Agent) | V2 (Desacoplado) | Ahorro |
|---|---|---|---|
| 2 hrs/día conversación | $270/mes | ~$22/mes | **92%** |
| 1 hr/día conversación | $135/mes | ~$15/mes | **89%** |
| 30 min/día | $67/mes | ~$10/mes | **85%** |