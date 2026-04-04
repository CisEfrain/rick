import { useEffect, useRef } from 'react';
import type { LogEntry } from '../hooks/useEmulatorSocket';

const LEVEL_COLORS: Record<string, string> = {
  info: '#4fc3f7',
  success: '#2ecc71',
  warn: '#f39c12',
  error: '#e74c3c',
};

export function LogViewer({ logs }: { logs: LogEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  return (
    <div style={{
      height: '100%', minHeight: 160, overflowY: 'auto',
      fontFamily: 'monospace', fontSize: 10, lineHeight: 1.8,
      padding: 8, background: '#050510', borderRadius: 6, border: '0.5px solid #14142a',
    }}>
      {logs.map((l, i) => (
        <div key={i}>
          <span style={{ color: '#14142a' }}>{new Date(l.ts).toLocaleTimeString('es-AR')}</span>{' '}
          <span style={{ color: LEVEL_COLORS[l.level] || '#2a2a4a' }}>[{l.src}]</span>{' '}
          <span style={{ color: LEVEL_COLORS[l.level] || '#4a5568' }}>{l.msg}</span>
        </div>
      ))}
      {!logs.length && <div style={{ color: '#14142a' }}>Conectá al Node Client para ver logs...</div>}
      <div ref={ref} />
    </div>
  );
}
