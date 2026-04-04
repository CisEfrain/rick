import { useEffect, useRef } from 'react';
import type { OLEDState } from '../hooks/useEmulatorSocket';

export function OLEDScreen({ oled }: { oled: OLEDState }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current?.getContext('2d');
    if (!c) return;

    c.fillStyle = '#000';
    c.fillRect(0, 0, 256, 128);
    c.strokeStyle = c.fillStyle = '#00ff41';
    c.lineWidth = 2;

    if (oled.state === 'IDLE') {
      c.beginPath(); c.arc(80, 44, 18, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(176, 44, 18, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(86, 42, 5, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(182, 42, 5, 0, Math.PI * 2); c.fill();
      c.font = '14px monospace'; c.fillText('zzz...', 106, 104);
    } else if (oled.state === 'LISTENING') {
      c.beginPath(); c.ellipse(80, 42, 22, 26, 0, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.ellipse(176, 42, 22, 26, 0, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(87, 39, 7, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(183, 39, 7, 0, Math.PI * 2); c.fill();
      c.font = '12px monospace';
      c.fillText(oled.extra || 'escuchando...', oled.extra ? 8 : 64, 108);
    } else if (oled.state === 'PROCESSING') {
      c.lineWidth = 4;
      c.beginPath(); c.moveTo(58, 44); c.lineTo(102, 44); c.stroke();
      c.beginPath(); c.moveTo(154, 44); c.lineTo(198, 44); c.stroke();
      c.font = '14px monospace'; c.fillText('pensando...', 72, 104);
    } else if (oled.state === 'SPEAKING') {
      c.beginPath(); c.arc(80, 42, 18, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(176, 42, 18, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(86, 40, 5, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(182, 40, 5, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(128, 88, 22, 13, 0, 0, Math.PI * 2); c.stroke();
    } else if (oled.state === 'ERROR') {
      c.font = 'bold 26px monospace'; c.fillText('X     X', 58, 50);
      c.font = '16px monospace'; c.fillText('¡Error!', 90, 104);
    } else {
      // DISCONNECTED, INIT, OFF, etc.
      c.font = '12px monospace';
      c.fillStyle = '#00ff4166';
      c.fillText(oled.state, 90, 68);
    }
  }, [oled]);

  return (
    <div style={{ background: '#030303', borderRadius: 8, padding: 6, display: 'inline-block', border: '1px solid #1a1a2e' }}>
      <canvas ref={ref} width={256} height={128} style={{ display: 'block', borderRadius: 3 }} />
      <div style={{ textAlign: 'center', marginTop: 3, fontSize: 8, color: '#1a1a2e', fontFamily: 'monospace' }}>
        OLED SH1106 128×64 emulado (2x)
      </div>
    </div>
  );
}
