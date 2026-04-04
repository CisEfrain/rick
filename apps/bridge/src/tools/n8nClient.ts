import https from 'node:https';
import http from 'node:http';
import { logger } from '../common/logger.js';
import { config } from '../config/appConfig.js';

export interface ToolCallArgs {
  toolName: string;
  args: any;
  callId: string;
  sessionId: string;
}

export async function executeN8nTool(params: ToolCallArgs): Promise<any> {
  const url = config.n8nToolWebhookUrl;

  if (!url) {
    logger.warn('n8n.no_url', { sessionId: params.sessionId });
    return { error: 'N8N_TOOL_WEBHOOK_URL is not configured.' };
  }

  const payload = JSON.stringify(params);

  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;

    const req = transport.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsedData = JSON.parse(data);
              resolve(parsedData);
            } catch (e) {
              resolve({ result: data });
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}
