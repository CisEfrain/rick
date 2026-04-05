import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../hooks/useEmulatorSocket';

export function Conversation({ messages }: { messages: ChatMessage[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 0' }}
    >
      {!messages.length && (
        <div style={{ textAlign: 'center', color: '#4a5568', padding: 24, fontSize: 11 }}>
          Hablá con Rick usando el micrófono
        </div>
      )}
      {messages.map((m, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 6 }}>
          <div style={{
            maxWidth: '88%', padding: '6px 10px', borderRadius: 8,
            background: m.role === 'user' ? '#6c5ce718' : '#2ecc7112',
            border: `0.5px solid ${m.role === 'user' ? '#6c5ce744' : '#2ecc7133'}`,
          }}>
            <div style={{ fontSize: 12, color: '#cbd5e0', lineHeight: 1.5 }}>{m.text}</div>
            <div style={{ fontSize: 9, color: '#4a5568', marginTop: 2, textAlign: 'right' }}>
              {new Date(m.ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              {m.latency != null && (
                <span style={{ marginLeft: 4, color: m.latency < 1500 ? '#2ecc71' : '#f39c12' }}>{m.latency}ms</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
