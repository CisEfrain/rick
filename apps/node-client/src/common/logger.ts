export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  sessionId?: string;
  utteranceId?: string;
  correlationId?: string;
  chunkIndex?: number;
  message?: string;
  [key: string]: unknown;
}

function log(level: LogLevel, event: string, data?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'event'>>): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...data,
  };
  const line = JSON.stringify(entry);
  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export const logger = {
  info: (event: string, data?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'event'>>) => log('info', event, data),
  warn: (event: string, data?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'event'>>) => log('warn', event, data),
  error: (event: string, data?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'event'>>) => log('error', event, data),
  debug: (event: string, data?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'event'>>) => log('debug', event, data),
};
