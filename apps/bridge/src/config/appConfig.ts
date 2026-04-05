export const config = {
  // Auth
  internalToken: process.env.INTERNAL_TOKEN || process.env.TOKEN || '',
  port: parseInt(process.env.BRIDGE_PORT || '3000', 10),

  // APIs
  deepgramApiKey: process.env.DEEPGRAM_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  n8nToolWebhookUrl: process.env.N8N_TOOL_WEBHOOK_URL || '',

  // STT
  sttModel: process.env.STT_MODEL || 'nova-3',
  sttLanguage: process.env.STT_LANGUAGE || 'es',
  sttIdleTimeoutMs: parseInt(process.env.STT_IDLE_TIMEOUT_MS || '120000', 10),
  sttUtteranceEndMs: parseInt(process.env.STT_UTTERANCE_END_MS || '500', 10),

  // LLM
  llmModel: process.env.LLM_MODEL || 'gpt-4o-mini',
  llmMaxTokens: parseInt(process.env.LLM_MAX_TOKENS || '300', 10),
  llmTemperature: parseFloat(process.env.LLM_TEMPERATURE || '0.8'),

  // TTS
  ttsModel: process.env.TTS_MODEL || 'aura-2-es-alvaro',
  ttsSampleRate: parseInt(process.env.TTS_SAMPLE_RATE || '16000', 10),

  // Weather (optional)
  weatherApiKey: process.env.WEATHER_API_KEY || '',

  // Memory
  memoryDir: process.env.MEMORY_DIR || '',
};
