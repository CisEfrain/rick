import OpenAI from 'openai';
import { EventEmitter } from 'node:events';
import { logger } from '../common/logger.js';
import { config } from '../config/appConfig.js';
import { tools } from '../tools/toolDefinitions.js';
import { executeTool } from '../tools/toolExecutor.js';
import type { BackgroundQueue } from '../pipeline/backgroundQueue.js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export interface OpenAILLMEvents {
  text_chunk: [chunk: string];
  response_complete: [fullText: string];
  tool_call: [data: { name: string; args: unknown; callId: string }];
  tool_result: [data: { name: string; result: string; callId: string }];
  error: [error: Error];
}

export class OpenAILLM extends EventEmitter<OpenAILLMEvents> {
  private client: OpenAI;
  private sessionId: string;
  private systemPrompt = '';
  private messages: ChatCompletionMessageParam[] = [];
  private abortController: AbortController | null = null;
  public bgQueue?: BackgroundQueue;

  constructor(sessionId: string) {
    super();
    this.sessionId = sessionId;
    this.client = new OpenAI({ apiKey: config.openaiApiKey });
  }

  initSession(systemPrompt: string): void {
    this.systemPrompt = systemPrompt;
    this.messages = [];
  }

  updateSystemPrompt(systemPrompt: string): void {
    this.systemPrompt = systemPrompt;
  }

  async processUserMessage(text: string): Promise<void> {
    this.messages.push({ role: 'user', content: text });

    // Cancel any previous in-flight request
    this.abortController?.abort();
    this.abortController = new AbortController();

    try {
      await this.streamCompletion(this.abortController.signal);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      logger.error('llm.error', { sessionId: this.sessionId, message: err.message });
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async streamCompletion(signal: AbortSignal): Promise<void> {
    const allMessages: ChatCompletionMessageParam[] = [
      { role: 'system', content: this.systemPrompt },
      ...this.messages,
    ];

    const stream = await this.client.chat.completions.create(
      {
        model: config.llmModel,
        messages: allMessages,
        tools,
        stream: true,
        max_tokens: config.llmMaxTokens,
        temperature: config.llmTemperature,
      },
      { signal },
    );

    let fullText = '';
    const toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> = [];

    for await (const chunk of stream) {
      if (signal.aborted) return;

      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      // Accumulate tool calls from streaming deltas
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!toolCalls[idx]) {
            toolCalls[idx] = { id: '', function: { name: '', arguments: '' } };
          }
          if (tc.id) toolCalls[idx].id = tc.id;
          if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
          if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
        }
      }

      // Emit text chunks for TTS streaming
      if (delta.content) {
        fullText += delta.content;
        this.emit('text_chunk', delta.content);
      }
    }

    // If the LLM wants to call tools, execute them and continue
    if (toolCalls.length > 0) {
      // Add the assistant message with tool calls to history
      this.messages.push({
        role: 'assistant',
        content: fullText || null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      });

      // Execute each tool and add results
      for (const tc of toolCalls) {
        if (signal.aborted) return;

        const toolName = tc.function.name;
        const toolArgs = JSON.parse(tc.function.arguments);

        logger.info('llm.tool_call', {
          sessionId: this.sessionId,
          name: toolName,
          callId: tc.id,
        });

        this.emit('tool_call', { name: toolName, args: toolArgs, callId: tc.id });

        const result = await executeTool({
          name: toolName,
          arguments: toolArgs,
          sessionId: this.sessionId,
          callId: tc.id,
          bgQueue: this.bgQueue,
        });

        this.emit('tool_result', { name: toolName, result, callId: tc.id });

        this.messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result,
        });
      }

      // Make another completion with tool results (recursive until text response)
      await this.streamCompletion(signal);
      return;
    }

    // No tool calls — this is the final text response
    if (fullText) {
      this.messages.push({ role: 'assistant', content: fullText });
    }

    logger.info('llm.response_complete', {
      sessionId: this.sessionId,
      length: fullText.length,
    });

    this.emit('response_complete', fullText);
  }

  /** Abort the current in-flight LLM request (for stop/interruption) */
  abort(): void {
    this.abortController?.abort();
  }

  /** Get conversation history in {role, content} format for memory persistence */
  getConversationMessages(): Array<{ role: string; content: string }> {
    const result: Array<{ role: string; content: string }> = [];
    for (const m of this.messages) {
      if ((m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') {
        result.push({ role: m.role, content: m.content });
      }
    }
    return result;
  }

  clearHistory(): void {
    this.messages = [];
  }

  /** Inject a proactive system message and generate a response (for background task results) */
  async injectProactiveMessage(systemMessage: string): Promise<void> {
    this.messages.push({ role: 'system', content: systemMessage });

    this.abortController?.abort();
    this.abortController = new AbortController();

    try {
      // Ask the LLM to communicate the result naturally
      await this.processUserMessage('[MENSAJE PROACTIVO - Rick debe comunicar al usuario]');
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      logger.error('llm.proactive_error', { sessionId: this.sessionId, message: err.message });
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    }
  }
}
