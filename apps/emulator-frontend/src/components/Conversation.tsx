import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../hooks/useEmulatorSocket';

export function Conversation({ messages }: { messages: ChatMessage[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  return (
    <div style={{ height: '100%', minHeight: 160, overflowY: 'auto' }}>
      {!messages.length && (
        <div style={{ textAlign: 'center', color: '#14142a', padding: 24, fontSize: 11 }}>
          Hablá con Rick usando el micrófono
        </div>
      )}
      {messages.map((m, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 6 }}>
          <div style={{
            maxWidth: '85%', padding: '6px 10px', borderRadius: 8,
            background: m.role === 'user' ? '#6c5ce718' : '#2ecc7112',
            border: `0.5px solid ${m.role === 'user' ? '#6c5ce733' : '#2ecc7125'}`,
          }}>
            <div style={{ fontSize: 11, color: '#b0b8c8', lineHeight: 1.5 }}>{m.text}</div>
            <div style={{ fontSize: 9, color: '#1e1e3a', marginTop: 2, textAlign: 'right' }}>
              {new Date(m.ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              {m.latency != null && (
                <span style={{ marginLeft: 4, color: m.latency < 1500 ? '#2ecc71' : '#f39c12' }}>{m.latency}ms</span>
              )}
            </div>
          </div>
        </div>
      ))}
      <div ref={ref} />
    </div>
  );
}
