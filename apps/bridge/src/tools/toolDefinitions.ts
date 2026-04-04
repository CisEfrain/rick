import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export const tools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'recordar',
      description:
        'Guardar información importante sobre el usuario en la memoria permanente de Rick. Usar cuando el usuario comparte datos personales, preferencias, o pide explícitamente que Rick recuerde algo.',
      parameters: {
        type: 'object',
        properties: {
          clave: {
            type: 'string',
            description:
              'Categoría del dato (nombre, edad, familia, preferencia, recordatorio, etc.)',
          },
          valor: {
            type: 'string',
            description: 'El dato a recordar',
          },
        },
        required: ['clave', 'valor'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_memoria',
      description:
        'Buscar en el historial de conversaciones y datos guardados. Usar cuando el usuario pregunta sobre algo que se habló antes o quiere recuperar información guardada.',
      parameters: {
        type: 'object',
        properties: {
          consulta: {
            type: 'string',
            description: 'Qué buscar en la memoria (tema, palabra clave, fecha aproximada)',
          },
        },
        required: ['consulta'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'obtener_clima',
      description:
        'Consultar el clima actual o pronóstico. Usar cuando el usuario pregunta por el clima o la temperatura.',
      parameters: {
        type: 'object',
        properties: {
          ciudad: {
            type: 'string',
            description:
              'Ciudad para consultar. Si no se especifica, usar la ciudad del usuario en Core Memory.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'obtener_hora',
      description:
        'Obtener la hora y fecha actual. Usar cuando el usuario pregunta qué hora es o qué día es.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mover',
      description:
        'Mover a Rick físicamente. Usar cuando el usuario pide que Rick se mueva, avance, retroceda, o gire. NOTA: esta acción es asincrónica, Rick confirma que va a moverse pero el movimiento tarda unos segundos.',
      parameters: {
        type: 'object',
        properties: {
          direccion: {
            type: 'string',
            enum: ['adelante', 'atras', 'izquierda', 'derecha', 'girar'],
            description: 'Dirección del movimiento',
          },
          duracion_ms: {
            type: 'number',
            description: 'Duración del movimiento en milisegundos. Default: 1000',
          },
        },
        required: ['direccion'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'poner_alarma',
      description:
        'Programar una alarma o recordatorio con sonido. Usar cuando el usuario pide que Rick le avise de algo en cierto tiempo.',
      parameters: {
        type: 'object',
        properties: {
          minutos: {
            type: 'number',
            description: 'En cuántos minutos debe sonar la alarma',
          },
          mensaje: {
            type: 'string',
            description: 'Qué debe decir Rick cuando suene la alarma',
          },
        },
        required: ['minutos', 'mensaje'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ejecutar_n8n',
      description:
        'Ejecutar una herramienta externa vía n8n. Usar para integraciones con servicios externos que no tienen tool dedicada.',
      parameters: {
        type: 'object',
        properties: {
          webhook: {
            type: 'string',
            description: 'Nombre del webhook de n8n a ejecutar',
          },
          datos: {
            type: 'object',
            description: 'Datos a enviar al webhook',
          },
        },
        required: ['webhook'],
      },
    },
  },
];
