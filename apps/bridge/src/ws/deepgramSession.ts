import { WebSocket } from 'ws';
import { createClient, AgentEvents } from '@deepgram/sdk';
import { logger } from '../common/logger.js';
import { config, getDeepgramAgentConfig } from '../config/deepgramConfig.js';
import { executeN8nTool } from '../tools/n8nClient.js';
import {
  loadCoreMemory,
  formatCoreMemoryForPrompt,
  saveCoreMemory,
  saveConversation,
  getRecentConversation,
  searchArchival,
} from '../memory/memoryStore.js';

const IDLE_TIMEOUT_MS = parseInt(process.env.DG_IDLE_TIMEOUT_MS || '120000', 10);

export class DeepgramSession {
  private sessionId: string;
  private clientWs: WebSocket;
  private dgConnection: any = null;
  private isAlive = true;
  private dgConnected = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private currentMessages: { role: string; content: string }[] = [];

  constructor(sessionId: string, clientWs: WebSocket) {
    this.sessionId = sessionId;
    this.clientWs = clientWs;
    this.connectDg();
  }

  private connectDg() {
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

    this.dgConnection.on(AgentEvents.Open, () => {
      if (!this.isAlive) {
        this.dgConnection?.disconnect();
        return;
      }
      logger.info('dg.connected', { sessionId: this.sessionId });
      this.dgConnected = true;

      // Load memory and configure agent with context
      const core = loadCoreMemory(this.sessionId);
      const coreMemory = formatCoreMemoryForPrompt(core);
      const recentConversation = getRecentConversation(this.sessionId);

      const agentConfig = getDeepgramAgentConfig({
        coreMemory,
        recentConversation,
      });

      logger.info('dg.configuring', {
        sessionId: this.sessionId,
        hasCoreMemory: !!coreMemory,
        hasRecentConversation: !!recentConversation,
        prompt: agentConfig.agent.think.prompt,
        greeting: agentConfig.agent.greeting,
      });

      this.dgConnection.configure(agentConfig);
      this.resetIdleTimer();
    });

    this.dgConnection.on(AgentEvents.SettingsApplied, () => {
      logger.info('dg.settings_applied', { sessionId: this.sessionId });
    });

    this.dgConnection.on(AgentEvents.Audio, (audio: any) => {
      this.resetIdleTimer();
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

      // Accumulate messages for saving on disconnect
      this.currentMessages.push({ role: data.role, content: data.content });
    });

    this.dgConnection.on(AgentEvents.FunctionCallRequest, async (data: any) => {
      // Deepgram sends { type: "FunctionCallRequest", functions: [{ id, name, arguments }] }
      const functions = data.functions || [];

      for (const fn of functions) {
        const callId = fn.id;
        const fnName = fn.name;
        const rawArgs = fn.arguments;
        logger.info('dg.tool_call_request', { sessionId: this.sessionId, name: fnName, callId });

        try {
          let result: any;
          const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;

          // Handle memory tools locally
          if (fnName === 'recordar') {
            saveCoreMemory(this.sessionId, args.key, args.value);
            result = { status: 'ok', message: `Guardado: ${args.key} = ${args.value}` };
          } else if (fnName === 'buscar_memoria') {
            const found = searchArchival(this.sessionId, args.query);
            result = { result: found };
          } else {
            // Forward to n8n for other tools
            result = await executeN8nTool({
              toolName: fnName,
              args,
              callId,
              sessionId: this.sessionId,
            });
          }

          // Response must match Deepgram's expected format with functions array
          this.dgConnection.send(JSON.stringify({
            type: 'FunctionCallResponse',
            functions: [{
              id: callId,
              name: fnName,
              output: JSON.stringify(result),
            }],
          }));
          logger.info('dg.tool_call_response_sent', { sessionId: this.sessionId, name: fnName, callId });
        } catch (e: any) {
          logger.error('dg.tool_call_error', { sessionId: this.sessionId, callId, name: fnName, message: e.message });
          this.dgConnection.send(JSON.stringify({
            type: 'FunctionCallResponse',
            functions: [{
              id: callId,
              name: fnName,
              output: JSON.stringify({ error: e.message }),
            }],
          }));
        }
      }
    });

    this.dgConnection.on(AgentEvents.Close, () => {
      logger.info('dg.disconnected', { sessionId: this.sessionId });
      this.dgConnected = false;
      this.dgConnection = null;
    });

    this.dgConnection.on(AgentEvents.Error, (err: any) => {
      logger.error('dg.error', { sessionId: this.sessionId, message: err.description || err.message });
    });
  }

  private resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.dgConnected && this.dgConnection) {
        logger.info('dg.idle_disconnect', { sessionId: this.sessionId, timeoutMs: IDLE_TIMEOUT_MS });
        this.persistConversation();
        this.disconnectDg();
      }
    }, IDLE_TIMEOUT_MS);
  }

  private persistConversation() {
    if (this.currentMessages.length > 0) {
      saveConversation(this.sessionId, this.currentMessages);
      this.currentMessages = [];
    }
  }

  private disconnectDg() {
    this.dgConnected = false;
    try {
      this.dgConnection?.disconnect();
    } catch { /* ignore */ }
    this.dgConnection = null;
  }

  public sendAudio(buffer: Buffer) {
    // Reconnect to Deepgram if session was closed due to idle
    if (!this.dgConnection && this.isAlive) {
      logger.info('dg.wake_up', { sessionId: this.sessionId });
      this.connectDg();
      return; // drop this chunk — DG is not ready yet
    }

    if (!this.dgConnected || !this.dgConnection) return;
    if (this.dgConnection.getReadyState() !== 1 /* OPEN */) return;

    this.resetIdleTimer();
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
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.persistConversation();
    this.disconnectDg();
  }
}
