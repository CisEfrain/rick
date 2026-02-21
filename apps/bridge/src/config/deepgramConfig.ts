export const config = {
  internalToken: process.env.INTERNAL_TOKEN || process.env.TOKEN || '',
  deepgramApiKey: process.env.DEEPGRAM_API_KEY || '',
  n8nToolWebhookUrl: process.env.N8N_TOOL_WEBHOOK_URL || '',
  port: parseInt(process.env.BRIDGE_PORT || '3000', 10),
};

export const getDeepgramAgentConfig = () => ({
  audio: {
    input: {
      encoding: 'linear16',
      sample_rate: 16000
    },
    output: {
      encoding: 'linear16',
      sample_rate: 16000,
      container: 'none'
    }
  },
  agent: {
    language: 'es',
    listen: {
      provider: {
        type: 'deepgram',
        model: 'nova-3'
      }
    },
    think: {
      provider: {
        type: 'open_ai',
        model: 'gpt-4o-mini',
      },
      prompt: 'Sos Rick, asistente de voz conversacional en español. Sé breve y claro.',
      functions: [
        {
          name: 'buscar_clima',
          description: 'Busca el clima de una determinada ciudad',
          parameters: {
            type: 'object',
            properties: {
              ciudad: {
                type: 'string',
                description: 'La ciudad para buscar el clima'
              }
            },
            required: ['ciudad']
          }
        },
        {
          name: 'buscar_hora',
          description: 'Busca la hora de una determinada ciudad',
          parameters: {
            type: 'object',
            properties: {
              ciudad: {
                type: 'string',
                description: 'La ciudad para buscar la hora'
              }
            },
            required: ['ciudad']
          }
        }
      ]
    },
    speak: {
      provider: {
        type: 'deepgram',
        model: 'aura-2-alvaro-es'
      }
    },
    greeting: '¡Hola! Soy Rick, tu asistente de voz. ¿En qué puedo ayudarte?'
  }
});
