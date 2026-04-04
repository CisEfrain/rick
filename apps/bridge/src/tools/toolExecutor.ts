import { logger } from '../common/logger.js';
import { saveCoreMemory, searchArchival } from '../memory/memoryStore.js';
import { executeN8nTool } from './n8nClient.js';
import { config } from '../config/appConfig.js';
import { BackgroundQueue } from '../pipeline/backgroundQueue.js';

export interface ToolCallInput {
  name: string;
  arguments: Record<string, any>;
  sessionId: string;
  callId: string;
  bgQueue?: BackgroundQueue;
}

const ASYNC_TOOLS = ['mover', 'poner_alarma'];

export async function executeTool(input: ToolCallInput): Promise<string> {
  const { name, arguments: args, sessionId, callId, bgQueue } = input;
  logger.info('tool.execute', { sessionId, name, callId });

  try {
    // Async tools → dispatch to background queue
    if (ASYNC_TOOLS.includes(name) && bgQueue) {
      bgQueue.enqueue({ tool: name, args, timestamp: Date.now() });
      const result = {
        status: 'dispatched',
        message: `Tarea '${name}' enviada. Se completará en unos segundos.`,
      };
      logger.info('tool.dispatched', { sessionId, name, callId });
      return JSON.stringify(result);
    }

    let result: any;

    switch (name) {
      case 'recordar':
        saveCoreMemory(sessionId, args.clave, args.valor);
        result = { status: 'ok', message: `Guardado: ${args.clave} = ${args.valor}` };
        break;

      case 'buscar_memoria': {
        const found = searchArchival(sessionId, args.consulta);
        result = { result: found };
        break;
      }

      case 'obtener_clima': {
        const ciudad = args.ciudad || 'Buenos Aires';
        result = await fetchWeather(ciudad);
        break;
      }

      case 'obtener_hora': {
        const now = new Date();
        result = {
          status: 'ok',
          hora: now.toLocaleTimeString('es-AR', { timeZone: 'America/Buenos_Aires' }),
          fecha: now.toLocaleDateString('es-AR', {
            timeZone: 'America/Buenos_Aires',
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }),
        };
        break;
      }

      case 'ejecutar_n8n': {
        if (!config.n8nToolWebhookUrl) {
          result = { error: 'N8N_TOOL_WEBHOOK_URL is not configured.' };
        } else {
          result = await executeN8nTool({
            toolName: args.webhook,
            args: args.datos || {},
            callId,
            sessionId,
          });
        }
        break;
      }

      default:
        // Forward unknown tools to n8n as fallback
        result = await executeN8nTool({
          toolName: name,
          args,
          callId,
          sessionId,
        });
        break;
    }

    logger.info('tool.result', { sessionId, name, callId, result: JSON.stringify(result) });
    return JSON.stringify(result);
  } catch (e: any) {
    logger.error('tool.error', { sessionId, name, callId, message: e.message });
    return JSON.stringify({ error: e.message });
  }
}

async function fetchWeather(city: string): Promise<any> {
  const apiKey = config.weatherApiKey;
  if (!apiKey) {
    return { error: 'WEATHER_API_KEY no está configurada.' };
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=es`;
    const res = await fetch(url);
    if (!res.ok) {
      return { error: `API de clima respondió ${res.status}` };
    }
    const data = await res.json();
    return {
      status: 'ok',
      temperatura: Math.round(data.main.temp),
      sensacion: Math.round(data.main.feels_like),
      descripcion: data.weather[0].description,
      humedad: data.main.humidity,
      ciudad: city,
    };
  } catch (e: any) {
    return { error: `Error consultando clima: ${e.message}` };
  }
}
