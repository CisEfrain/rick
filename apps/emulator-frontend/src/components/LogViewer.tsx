import { useEffect, useRef } from 'react';
import type { LogEntry } from '../hooks/useEmulatorSocket';

const LEVEL_COLORS: Record<string, string> = {
  info: '#4fc3f7',
  success: '#2ecc71',
  warn: '#f39c12',
  error: '#e74c3c',
};

export function LogViewer({ logs }: { logs: LogEntry[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1, minHeight: 0, overflowY: 'auto',
        fontFamily: 'monospace', fontSize: 10, lineHeight: 1.7,
        padding: 8, background: '#050510', borderRadius: 6, border: '0.5px solid #1e1e3a',
      }}
    >
      {logs.map((l, i) => (
        <div key={i} style={{ whiteSpace: 'nowrap' }}>
          <span style={{ color: '#4a5568' }}>{new Date(l.ts).toLocaleTimeString('es-AR')}</span>{' '}
          <span style={{ color: LEVEL_COLORS[l.level] || '#6b7280', fontWeight: 600 }}>[{l.src}]</span>{' '}
          <span style={{ color: '#8892a4' }}>{l.msg}</span>
        </div>
      ))}
      {!logs.length && <div style={{ color: '#4a5568' }}>Esperando conexión...</div>}
    </div>
  );
}
