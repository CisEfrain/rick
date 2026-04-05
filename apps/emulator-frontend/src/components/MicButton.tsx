interface MicButtonProps {
  active: boolean;
  level: number;
  speaking: boolean;
  rickState: string;
  onToggle: () => void;
}

export function MicButton({ active, level, speaking, onToggle }: MicButtonProps) {
  const r = Math.min(100, level) / 100;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <button
        onClick={onToggle}
        style={{
          width: 72, height: 72, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: active
            ? 'radial-gradient(circle, #e74c3c, #c0392b)'
            : speaking
              ? 'radial-gradient(circle, #27ae60, #1e8449)'
              : 'radial-gradient(circle, #6c5ce7, #5b4cdb)',
          boxShadow: active
            ? `0 0 ${15 + r * 35}px rgba(231,76,60,${0.25 + r * 0.4})`
            : speaking
              ? '0 0 15px rgba(46,204,113,0.25)'
              : '0 0 10px rgba(108,92,231,0.15)',
          transform: active ? `scale(${1 + r * 0.06})` : 'scale(1)',
          transition: 'box-shadow 0.1s, transform 0.1s',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
          {speaking ? (
            <>
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="white" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </>
          ) : (
            <>
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 10a7 7 0 0 0 14 0" />
              <line x1="12" y1="17" x2="12" y2="22" />
            </>
          )}
        </svg>
      </button>

      <span style={{
        fontSize: 9, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase',
        color: active ? '#e74c3c' : speaking ? '#2ecc71' : '#6b7280',
      }}>
        {active ? 'Click para apagar' : speaking ? 'Rick habla' : 'Click para activar mic'}
      </span>

      {active && (
        <div style={{ display: 'flex', gap: 1.5, height: 14, alignItems: 'flex-end' }}>
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} style={{
              width: 2, height: Math.max(2, (level / 5) + Math.random() * 5),
              background: '#e74c3c', borderRadius: 1, transition: 'height 0.05s',
            }} />
          ))}
        </div>
      )}
    </div>
  );
}
