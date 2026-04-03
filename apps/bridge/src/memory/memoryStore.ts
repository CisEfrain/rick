import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { logger } from '../common/logger.js';

const MEMORY_DIR = process.env.MEMORY_DIR || join(process.cwd(), 'data', 'memory');
const MAX_CONVERSATIONS = 20;
const MAX_MESSAGES_PER_CONVERSATION = 20;

export interface CoreMemory {
  user_name: string;
  facts: string[];
  preferences: string[];
  updated_at: string;
}

export interface ConversationEntry {
  timestamp: string;
  messages: { role: string; content: string }[];
}

export interface ArchivalEntry {
  key: string;
  value: string;
  saved_at: string;
}

interface MemoryFile {
  core: CoreMemory;
  conversations: ConversationEntry[];
  archival: ArchivalEntry[];
}

function memoryPath(sessionId: string): string {
  return join(MEMORY_DIR, `${sessionId}.json`);
}

function loadFile(sessionId: string): MemoryFile {
  try {
    const data = readFileSync(memoryPath(sessionId), 'utf-8');
    return JSON.parse(data) as MemoryFile;
  } catch {
    return {
      core: { user_name: '', facts: [], preferences: [], updated_at: '' },
      conversations: [],
      archival: [],
    };
  }
}

function saveFile(sessionId: string, data: MemoryFile): void {
  const filePath = memoryPath(sessionId);
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });

  // Atomic write: write to tmp then rename
  const tmpPath = filePath + '.tmp';
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  renameSync(tmpPath, filePath);
}

// --- Core Memory (Level 1) ---

export function loadCoreMemory(sessionId: string): CoreMemory {
  return loadFile(sessionId).core;
}

export function formatCoreMemoryForPrompt(core: CoreMemory): string {
  const lines: string[] = [];
  if (core.user_name) lines.push(`- Se llama ${core.user_name}`);
  for (const fact of core.facts) lines.push(`- ${fact}`);
  for (const pref of core.preferences) lines.push(`- Preferencia: ${pref}`);
  return lines.length > 0 ? lines.join('\n') : '';
}

export function saveCoreMemory(sessionId: string, key: string, value: string): void {
  const data = loadFile(sessionId);

  if (key === 'nombre' || key === 'name' || key === 'user_name') {
    data.core.user_name = value;
  } else if (key === 'preferencia' || key === 'preference') {
    if (!data.core.preferences.includes(value)) {
      data.core.preferences.push(value);
    }
  } else {
    if (!data.core.facts.includes(value)) {
      data.core.facts.push(value);
    }
  }

  data.core.updated_at = new Date().toISOString();
  saveFile(sessionId, data);
  logger.info('memory.core_saved', { sessionId, key, value });
}

// --- Conversations ---

export function saveConversation(sessionId: string, messages: { role: string; content: string }[]): void {
  if (messages.length === 0) return;

  const data = loadFile(sessionId);
  const trimmed = messages.slice(-MAX_MESSAGES_PER_CONVERSATION);

  data.conversations.push({
    timestamp: new Date().toISOString(),
    messages: trimmed,
  });

  // Keep only the last N conversations
  if (data.conversations.length > MAX_CONVERSATIONS) {
    data.conversations = data.conversations.slice(-MAX_CONVERSATIONS);
  }

  saveFile(sessionId, data);
  logger.info('memory.conversation_saved', { sessionId, messageCount: trimmed.length });
}

export function getRecentConversation(sessionId: string): string {
  const data = loadFile(sessionId);
  if (data.conversations.length === 0) return '';

  const last = data.conversations[data.conversations.length - 1];
  return last.messages
    .map((m) => `- ${m.role === 'user' ? 'Usuario' : 'Rick'}: "${m.content}"`)
    .join('\n');
}

// --- Archival Memory (Level 2) ---

export function saveArchival(sessionId: string, key: string, value: string): void {
  const data = loadFile(sessionId);

  // Update existing or add new
  const existing = data.archival.find((a) => a.key === key);
  if (existing) {
    existing.value = value;
    existing.saved_at = new Date().toISOString();
  } else {
    data.archival.push({ key, value, saved_at: new Date().toISOString() });
  }

  saveFile(sessionId, data);
  logger.info('memory.archival_saved', { sessionId, key });
}

export function searchArchival(sessionId: string, query: string): string {
  const data = loadFile(sessionId);
  const queryLower = query.toLowerCase();

  // Search in archival entries
  const archivalMatches = data.archival.filter(
    (a) => a.key.toLowerCase().includes(queryLower) || a.value.toLowerCase().includes(queryLower)
  );

  // Search in conversation history
  const convMatches: string[] = [];
  for (const conv of data.conversations.slice(-5)) {
    for (const msg of conv.messages) {
      if (msg.content.toLowerCase().includes(queryLower)) {
        convMatches.push(`[${conv.timestamp}] ${msg.role === 'user' ? 'Usuario' : 'Rick'}: "${msg.content}"`);
      }
    }
  }

  const results: string[] = [];
  if (archivalMatches.length > 0) {
    results.push('Datos guardados:');
    for (const a of archivalMatches) results.push(`- ${a.key}: ${a.value}`);
  }
  if (convMatches.length > 0) {
    results.push('De conversaciones pasadas:');
    results.push(...convMatches.slice(-5));
  }

  if (results.length === 0) return 'No encontré nada relacionado en mi memoria.';
  return results.join('\n');
}
