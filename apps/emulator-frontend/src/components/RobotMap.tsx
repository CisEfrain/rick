import type { MotorState, RobotPos } from '../hooks/useEmulatorSocket';

interface RobotMapProps {
  motors: MotorState;
  pos: RobotPos;
}

export function RobotMap({ motors, pos }: RobotMapProps) {
  const active = motors.left !== 0 || motors.right !== 0;

  return (
    <div style={{
      position: 'relative', width: '100%', height: 200,
      background: '#060610', borderRadius: 6, border: '0.5px solid #14142a', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', fontSize: 8, color: '#4a5568', top: 4, left: 6, fontFamily: 'monospace' }}>
        MAPA 2D — tracción diferencial
      </div>

      {/* Grid */}
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={`h${i}`} style={{ position: 'absolute', top: i * 20, left: 0, right: 0, height: 0.5, background: '#0a0a18' }} />
      ))}
      {Array.from({ length: 16 }).map((_, i) => (
        <div key={`v${i}`} style={{ position: 'absolute', left: i * 20, top: 0, bottom: 0, width: 0.5, background: '#0a0a18' }} />
      ))}

      {/* Robot */}
      <div style={{ position: 'absolute', left: pos.x - 6, top: pos.y - 6, width: 12, height: 12, transition: 'all 0.3s ease-out' }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%', margin: '0 auto',
          background: active ? '#2ecc71' : '#6c5ce7',
          boxShadow: active ? '0 0 10px #2ecc71' : '0 0 4px #6c5ce744',
        }} />
        <div style={{
          width: 0, height: 0,
          borderLeft: '4px solid transparent', borderRight: '4px solid transparent',
          borderBottom: `6px solid ${active ? '#2ecc71' : '#6c5ce7'}`,
          margin: '-11px auto 0', transform: `rotate(${pos.angle}deg)`, transformOrigin: 'center 8px',
        }} />
      </div>

      {/* Coords */}
      <div style={{ position: 'absolute', bottom: 4, right: 6, fontSize: 8, color: '#4a5568', fontFamily: 'monospace' }}>
        x:{Math.round(pos.x)} y:{Math.round(pos.y)} θ:{Math.round(pos.angle)}°
      </div>
      <div style={{ position: 'absolute', bottom: 4, left: 6, fontSize: 8, fontFamily: 'monospace' }}>
        <span style={{ color: motors.left ? '#2ecc71' : '#4a5568' }}>L:{motors.left}%</span>{' '}
        <span style={{ color: motors.right ? '#2ecc71' : '#4a5568' }}>R:{motors.right}%</span>
      </div>
    </div>
  );
}

interface MotorControlsProps {
  onMove: (direction: string) => void;
}

export function MotorControls({ onMove }: MotorControlsProps) {
  const b: React.CSSProperties = {
    width: 28, height: 28, borderRadius: 5,
    border: '1px solid #1e1e3a', background: '#0a0a14',
    color: '#4a5568', fontSize: 13, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3, width: 94 }}>
      <div />
      <button style={b} onClick={() => onMove('adelante')}>↑</button>
      <div />
      <button style={b} onClick={() => onMove('izquierda')}>←</button>
      <button style={b} onClick={() => onMove('girar')}>⟲</button>
      <button style={b} onClick={() => onMove('derecha')}>→</button>
      <div />
      <button style={b} onClick={() => onMove('atras')}>↓</button>
    </div>
  );
}
