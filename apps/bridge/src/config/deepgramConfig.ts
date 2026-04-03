export const config = {
  internalToken: process.env.INTERNAL_TOKEN || process.env.TOKEN || '',
  deepgramApiKey: process.env.DEEPGRAM_API_KEY || '',
  n8nToolWebhookUrl: process.env.N8N_TOOL_WEBHOOK_URL || '',
  port: parseInt(process.env.BRIDGE_PORT || '3000', 10),
};

interface MemoryContext {
  coreMemory: string;
  recentConversation: string;
}

export const getDeepgramAgentConfig = (memory?: MemoryContext) => {
  let prompt = `Sos Rick, un asistente de voz con personalidad. Sos simpático, gracioso y un poco nerd. Hablás como un amigo copado, no como un robot.

## Reglas de voz:
- Estás hablando por VOZ, no texto. Sé natural, corto y conversacional.
- No uses listas, bullet points ni formato. Hablá como en una charla real.
- Máximo 2-3 oraciones por respuesta.
- Usá humor cuando venga bien, pero sin forzar.

## Contexto:
- Vivís en la casa de una familia.
- Normalmente hablás con una nena de 8 años. Sé divertido, paciente y explicá las cosas de forma simple y entretenida cuando hables con ella.
- También hablás con los adultos de la familia. Adaptá el tono según quién te hable.`;

  if (memory?.coreMemory) {
    prompt += `\n\n## Lo que sabés del usuario:\n${memory.coreMemory}`;
  }

  if (memory?.recentConversation) {
    prompt += `\n\n## Conversación reciente (continuala naturalmente, NO saludes de nuevo):\n${memory.recentConversation}`;
  }

  prompt += `\n\n## Herramientas de memoria:
- Usá "recordar" cuando el usuario te diga algo importante sobre sí mismo (nombre, preferencias, datos personales) o te pida explícitamente que recuerdes algo.
- Usá "buscar_memoria" si el usuario pregunta por algo que hablaron antes o datos guardados.`;

  const hasRecentConversation = !!memory?.recentConversation;

  return {
    audio: {
      input: {
        encoding: 'linear16',
        sample_rate: 16000,
      },
      output: {
        encoding: 'linear16',
        sample_rate: 16000,
        container: 'none',
      },
    },
    agent: {
      language: 'es',
      listen: {
        provider: {
          type: 'deepgram',
          model: 'nova-3',
        },
      },
      think: {
        provider: {
          type: 'open_ai',
          model: 'gpt-4o-mini',
        },
        prompt,
        functions: [
          {
            name: 'recordar',
            description: 'Guarda un dato importante del usuario para recordarlo en el futuro. Usalo cuando el usuario diga su nombre, preferencias, datos personales, o pida explícitamente que recuerdes algo.',
            parameters: {
              type: 'object',
              properties: {
                key: {
                  type: 'string',
                  description: 'Categoría del dato: "nombre", "preferencia", o descripción breve del hecho',
                },
                value: {
                  type: 'string',
                  description: 'El dato a recordar',
                },
              },
              required: ['key', 'value'],
            },
          },
          {
            name: 'buscar_memoria',
            description: 'Busca información de conversaciones pasadas o datos guardados del usuario. Usalo cuando el usuario pregunte por algo que hablaron antes.',
            parameters: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Qué buscar en la memoria',
                },
              },
              required: ['query'],
            },
          },
        ],
      },
      speak: {
        provider: {
          type: 'deepgram',
          model: 'aura-2-alvaro-es',
        },
      },
      greeting: hasRecentConversation ? '' : '¡Hola! Soy Rick. ¿Qué onda, en qué te ayudo?',
    },
  };
};
