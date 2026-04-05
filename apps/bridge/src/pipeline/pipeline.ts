import { WebSocket } from 'ws';
import { logger } from '../common/logger.js';
import { config } from '../config/appConfig.js';
import { buildSystemPrompt, shouldGreet } from '../prompts.js';
import {
  loadCoreMemory,
  formatCoreMemoryForPrompt,
  saveConversation,
  getRecentConversation,
} from '../memory/memoryStore.js';
import { DeepgramSTT } from '../stt/deepgramSTT.js';
import { OpenAILLM } from '../llm/openaiLLM.js';
import { DeepgramTTS } from '../tts/deepgramTTS.js';
import { TextAccumulator } from './textAccumulator.js';
import { BackgroundQueue } from './backgroundQueue.js';

enum PipelineState {
  IDLE = 'IDLE',
  LISTENING = 'LISTENING',
  PROCESSING = 'PROCESSING',
  SPEAKING = 'SPEAKING',
  ERROR = 'ERROR',
}

export class Pipeline {
  private sessionId: string;
  private clientWs: WebSocket;

  private stt: DeepgramSTT;
  private llm: OpenAILLM;
  private tts: DeepgramTTS;
  private accumulator: TextAccumulator;
  private bgQueue: BackgroundQueue;

  private state: PipelineState = PipelineState.IDLE;
  private isAlive = true;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private currentMessages: { role: string; content: string }[] = [];

  // TTS sentence queue — processed sequentially
  private ttsQueue: string[] = [];
  private ttsProcessing = false;
  private ttsSentFirstAudio = false;
  private llmResponseDone = false;
  private currentResponseText = '';
  private bgPollInterval: ReturnType<typeof setInterval> | null = null;

  constructor(sessionId: string, clientWs: WebSocket) {
    this.sessionId = sessionId;
    this.clientWs = clientWs;

    this.stt = new DeepgramSTT(sessionId);
    this.llm = new OpenAILLM(sessionId);
    this.tts = new DeepgramTTS(sessionId);
    this.accumulator = new TextAccumulator();
    this.bgQueue = new BackgroundQueue();

    // Give LLM access to background queue for async tool dispatch
    this.llm.bgQueue = this.bgQueue;

    // TTS streaming: forward audio chunks to client as they arrive
    this.tts.on('audio', (buffer: Buffer) => {
      if (!this.ttsSentFirstAudio) {
        this.ttsSentFirstAudio = true;
        this.setState(PipelineState.SPEAKING);
        this.forwardJsonToClient({ type: 'audio.start' });
      }
      this.forwardToClient(buffer);
    });

    this.wireEvents();
    this.initSession();

    // Poll background queue for completed async tasks every 2 seconds
    this.bgPollInterval = setInterval(() => this.checkBackgroundQueue(), 2000);
  }

  private wireEvents(): void {
    // STT → partial transcript (for future OLED feedback)
    this.stt.on('partial', (text) => {
      this.setState(PipelineState.LISTENING);
    });

    // STT → final utterance → send to LLM
    this.stt.on('utterance', async (text) => {
      this.setState(PipelineState.PROCESSING);
      this.currentMessages.push({ role: 'user', content: text });

      // Reset TTS state for new response
      this.ttsQueue = [];
      this.ttsProcessing = false;
      this.ttsSentFirstAudio = false;
      this.llmResponseDone = false;
      this.currentResponseText = '';

      try {
        await this.llm.processUserMessage(text);
      } catch (err: any) {
        logger.error('pipeline.llm_error', { sessionId: this.sessionId, message: err.message });
        this.setState(PipelineState.ERROR);
        // Try to speak a fallback error message
        await this.speakFallback('Perdón, no pude procesar eso. ¿Podés repetirlo?');
      }
    });

    this.stt.on('error', (err) => {
      logger.error('pipeline.stt_error', { sessionId: this.sessionId, message: err.message });
    });

    this.stt.on('close', () => {
      // STT closed — could be idle disconnect or error
      // Don't change state if we're processing/speaking
      if (this.state === PipelineState.IDLE || this.state === PipelineState.LISTENING) {
        this.setState(PipelineState.IDLE);
      }
    });

    // LLM → text chunks → accumulator
    this.llm.on('text_chunk', (chunk) => {
      this.currentResponseText += chunk;
      this.accumulator.addChunk(chunk);
    });

    // LLM → response complete → flush remaining text
    this.llm.on('response_complete', (fullText) => {
      this.llmResponseDone = true;
      this.accumulator.flush();

      if (fullText) {
        this.currentMessages.push({ role: 'assistant', content: fullText });
      }

      // If no sentences were queued (e.g. empty response), go back to idle
      if (!this.ttsProcessing && this.ttsQueue.length === 0) {
        this.finishSpeaking();
      }
    });

    this.llm.on('error', (err) => {
      logger.error('pipeline.llm_stream_error', {
        sessionId: this.sessionId,
        message: err.message,
      });
    });

    // Accumulator → sentence ready → enqueue for TTS
    this.accumulator.on('sentence', (sentence) => {
      this.ttsQueue.push(sentence);
      this.processTtsQueue();
    });
  }

  private async initSession(): Promise<void> {
    // Load memory and build prompt
    const core = loadCoreMemory(this.sessionId);
    const coreMemory = formatCoreMemoryForPrompt(core);
    const recentConversation = getRecentConversation(this.sessionId);

    const systemPrompt = buildSystemPrompt({ coreMemory, recentConversation });
    this.llm.initSession(systemPrompt);

    logger.info('pipeline.init', {
      sessionId: this.sessionId,
      hasCoreMemory: !!coreMemory,
      hasRecentConversation: !!recentConversation,
    });

    // Connect STT
    this.stt.connect();
    this.resetIdleTimer();

    // Generate greeting if no recent conversation
    if (shouldGreet({ recentConversation })) {
      // Reset TTS state for greeting
      this.ttsQueue = [];
      this.ttsProcessing = false;
      this.ttsSentFirstAudio = false;
      this.llmResponseDone = false;
      this.currentResponseText = '';

      try {
        await this.llm.processUserMessage(
          '[Sistema: el usuario acaba de conectarse. Saludalo brevemente con tu estilo.]',
        );
      } catch (err: any) {
        logger.error('pipeline.greeting_error', {
          sessionId: this.sessionId,
          message: err.message,
        });
      }
    }
  }

  /** Process TTS sentences sequentially via streaming WebSocket */
  private async processTtsQueue(): Promise<void> {
    if (this.ttsProcessing) return;
    if (this.ttsQueue.length === 0) return;

    this.ttsProcessing = true;

    while (this.ttsQueue.length > 0) {
      const sentence = this.ttsQueue.shift()!;
      // speak() envía texto + Flush al WS de Deepgram.
      // Los chunks de audio llegan via evento "audio" (wired en constructor).
      // speak() resuelve cuando Deepgram confirma Flushed.
      await this.tts.speak(sentence);
    }

    this.ttsProcessing = false;

    // If LLM is done and queue is empty, finish speaking
    if (this.llmResponseDone && this.ttsQueue.length === 0) {
      this.finishSpeaking();
    }
  }

  private finishSpeaking(): void {
    if (this.ttsSentFirstAudio) {
      this.forwardJsonToClient({ type: 'audio.end' });
    }
    // Cerrar WS de TTS — se reconecta solo en el próximo speak()
    this.tts.close();
    this.setState(PipelineState.IDLE);
    this.resetIdleTimer();
  }

  /** Speak a fallback message directly (for error recovery) */
  private async speakFallback(text: string): Promise<void> {
    this.ttsSentFirstAudio = false;
    await this.tts.speak(text);
    if (this.ttsSentFirstAudio) {
      this.forwardJsonToClient({ type: 'audio.end' });
    }
    this.setState(PipelineState.IDLE);
  }

  // --- Public interface (matches DeepgramSession) ---

  public sendAudio(buffer: Buffer): void {
    // Reconnect STT if it was disconnected due to idle
    if (!this.stt.isConnected && this.isAlive) {
      logger.info('pipeline.wake_up', { sessionId: this.sessionId });
      this.reconnectSTT();
      return; // Drop this chunk — STT is not ready yet
    }

    this.stt.sendAudio(buffer);
    this.resetIdleTimer();
  }

  public handleStop(): void {
    logger.info('pipeline.stop', { sessionId: this.sessionId });

    // Abort LLM stream
    this.llm.abort();

    // Clear TTS pipeline
    this.accumulator.clear();
    this.ttsQueue = [];
    this.llmResponseDone = true;

    // Send audio.end if we were speaking
    if (this.ttsSentFirstAudio) {
      this.forwardJsonToClient({ type: 'audio.end' });
    }

    this.setState(PipelineState.IDLE);
  }

  public close(): void {
    this.isAlive = false;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.bgPollInterval) clearInterval(this.bgPollInterval);
    this.llm.abort();
    this.persistConversation();
    this.stt.disconnect();
    this.tts.close();
  }

  // --- Internal helpers ---

  /** Check for completed background tasks and generate proactive messages */
  private async checkBackgroundQueue(): Promise<void> {
    if (this.state !== PipelineState.IDLE) return;
    const result = this.bgQueue.dequeue();
    if (!result) return;

    logger.info('pipeline.proactive', { sessionId: this.sessionId, tool: result.tool });

    // Reset TTS state for proactive message
    this.ttsQueue = [];
    this.ttsProcessing = false;
    this.ttsSentFirstAudio = false;
    this.llmResponseDone = false;
    this.currentResponseText = '';

    try {
      await this.llm.injectProactiveMessage(
        `RESULTADO DE TAREA EN BACKGROUND: La tarea '${result.tool}' ` +
        `se completó. Resultado: ${JSON.stringify(result.result)}. ` +
        `Comunicá esto al usuario de forma natural y breve.`,
      );
    } catch (err: any) {
      logger.error('pipeline.proactive_error', {
        sessionId: this.sessionId,
        message: err.message,
      });
    }
  }

  private reconnectSTT(): void {
    // Refresh memory context on reconnect
    const core = loadCoreMemory(this.sessionId);
    const coreMemory = formatCoreMemoryForPrompt(core);
    const recentConversation = getRecentConversation(this.sessionId);

    const systemPrompt = buildSystemPrompt({ coreMemory, recentConversation });
    this.llm.updateSystemPrompt(systemPrompt);

    // Keep LLM conversation history (don't clear) for session continuity

    this.stt.connect();
    this.resetIdleTimer();
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.stt.isConnected) {
        logger.info('pipeline.idle_disconnect', {
          sessionId: this.sessionId,
          timeoutMs: config.sttIdleTimeoutMs,
        });
        this.persistConversation();
        this.stt.disconnect();
      }
    }, config.sttIdleTimeoutMs);
  }

  private persistConversation(): void {
    // Merge LLM conversation history with accumulated messages
    const llmMessages = this.llm.getConversationMessages();
    const messages = llmMessages.length > 0 ? llmMessages : this.currentMessages;

    if (messages.length > 0) {
      saveConversation(this.sessionId, messages);
      this.currentMessages = [];
    }
  }

  private setState(newState: PipelineState): void {
    if (this.state !== newState) {
      logger.info('pipeline.state', {
        sessionId: this.sessionId,
        from: this.state,
        to: newState,
      });
      this.state = newState;
    }
  }

  private forwardToClient(data: Buffer): void {
    if (this.clientWs.readyState === WebSocket.OPEN) {
      this.clientWs.send(data);
    }
  }

  private forwardJsonToClient(data: any): void {
    if (this.clientWs.readyState === WebSocket.OPEN) {
      this.clientWs.send(JSON.stringify(data));
    }
  }
}
