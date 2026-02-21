import { WebSocket } from 'ws';
import { createClient, AgentEvents } from '@deepgram/sdk';
import { logger } from '../common/logger.js';
import { config, getDeepgramAgentConfig } from '../config/deepgramConfig.js';
import { executeN8nTool } from '../tools/n8nClient.js';

export class DeepgramSession {
  private sessionId: string;
  private clientWs: WebSocket;
  private dgConnection: any = null;
  private isAlive = true;

  constructor(sessionId: string, clientWs: WebSocket) {
    this.sessionId = sessionId;
    this.clientWs = clientWs;
    this.connect();
  }

  private connect() {
    if (!config.deepgramApiKey) {
      logger.error('dg.no_api_key', { sessionId: this.sessionId });
      return;
    }

    logger.info('dg.connecting', { sessionId: this.sessionId });

    try {
      const deepgram = createClient(config.deepgramApiKey);
      this.dgConnection = deepgram.agent();
      logger.info('dg.agent_created', { sessionId: this.sessionId });
    } catch (err: any) {
      logger.error('dg.create_failed', { sessionId: this.sessionId, message: err.message, stack: err.stack });
      return;
    }

    logger.info('dg.registering_handlers', { sessionId: this.sessionId });

    this.dgConnection.on(AgentEvents.Open, () => {
      if (!this.isAlive) {
        this.dgConnection?.disconnect();
        return;
      }
      logger.info('dg.connected', { sessionId: this.sessionId });
      this.dgConnection.configure(getDeepgramAgentConfig());
    });

    this.dgConnection.on(AgentEvents.SettingsApplied, () => {
      logger.info('dg.settings_applied', { sessionId: this.sessionId });
    });

    this.dgConnection.on(AgentEvents.Audio, (audio: any) => {
      this.forwardToClient(Buffer.isBuffer(audio) ? audio : Buffer.from(audio));
    });

    this.dgConnection.on(AgentEvents.AgentStartedSpeaking, () => {
      logger.info('dg.agent_speaking', { sessionId: this.sessionId });
      this.forwardJsonToClient({ type: 'audio.start' });
    });

    this.dgConnection.on(AgentEvents.AgentAudioDone, () => {
      logger.info('dg.agent_audio_done', { sessionId: this.sessionId });
      this.forwardJsonToClient({ type: 'audio.end' });
    });

    this.dgConnection.on(AgentEvents.UserStartedSpeaking, () => {
      logger.info('dg.user_speaking', { sessionId: this.sessionId });
    });

    this.dgConnection.on(AgentEvents.ConversationText, (data: any) => {
      logger.info('dg.conversation', { sessionId: this.sessionId, role: data.role, content: data.content });
    });

    this.dgConnection.on(AgentEvents.FunctionCallRequest, async (data: any) => {
      const { function_call_id, function_name, input } = data;
      logger.info('dg.tool_call_request', { sessionId: this.sessionId, name: function_name, callId: function_call_id });

      try {
        const result = await executeN8nTool({
          toolName: function_name,
          args: typeof input === 'string' ? JSON.parse(input) : input,
          callId: function_call_id,
          sessionId: this.sessionId,
        });
        this.dgConnection.send(JSON.stringify({
          type: 'FunctionCallResponse',
          function_call_id,
          output: JSON.stringify(result),
        }));
        logger.info('dg.tool_call_response_sent', { sessionId: this.sessionId, callId: function_call_id });
      } catch (e: any) {
        logger.error('dg.tool_call_error', { sessionId: this.sessionId, callId: function_call_id, message: e.message });
        this.dgConnection.send(JSON.stringify({
          type: 'FunctionCallResponse',
          function_call_id,
          output: JSON.stringify({ error: e.message }),
        }));
      }
    });

    this.dgConnection.on(AgentEvents.Close, () => {
      logger.info('dg.disconnected', { sessionId: this.sessionId });
      this.isAlive = false;
    });

    this.dgConnection.on(AgentEvents.Error, (err: any) => {
      logger.error('dg.error', { sessionId: this.sessionId, message: err.description || err.message });
    });
  }

  public sendAudio(buffer: Buffer) {
    if (!this.isAlive || !this.dgConnection) return;
    if (this.dgConnection.getReadyState() !== 1 /* OPEN */) return;
    this.dgConnection.send(buffer);
  }

  private forwardToClient(data: Buffer) {
    if (this.clientWs.readyState === WebSocket.OPEN) {
      this.clientWs.send(data);
    }
  }

  private forwardJsonToClient(data: any) {
    if (this.clientWs.readyState === WebSocket.OPEN) {
      this.clientWs.send(JSON.stringify(data));
    }
  }

  public close() {
    this.isAlive = false;
    try {
      this.dgConnection?.disconnect();
    } catch (e) {
      // ignore
    }
  }
}
