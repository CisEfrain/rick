import { useCallback, useState } from 'react';
import { useEmulatorSocket } from './hooks/useEmulatorSocket';
import { useMicrophone } from './hooks/useMicrophone';
import { OLEDScreen } from './components/OLEDScreen';
import { MicButton } from './components/MicButton';
import { RobotMap, MotorControls } from './components/RobotMap';
import { Conversation } from './components/Conversation';
import { LogViewer } from './components/LogViewer';

export function App() {
  const { state, dispatch, connect, disconnect, sendBinary, sendJson, handleMotor } = useEmulatorSocket();
  const [micLevel, setMicLevel] = useState(0);
  const [micOn, setMicOn] = useState(false);
  const [micCooling, setMicCooling] = useState(false);

  const onLevel = useCallback((level: number) => setMicLevel(level), []);

  useMicrophone(micOn && state.wsState === 'connected', sendBinary, onLevel);

  const toggleMic = useCallback(() => {
    if (micCooling) return;
    if (!micOn) {
      setMicOn(true);
      sendJson({ type: 'ptt_press' });
    } else {
      sendJson({ type: 'ptt_release' });
      setMicCooling(true);
      setTimeout(() => {
        setMicOn(false);
        setMicCooling(false);
      }, 1500);
    }
  }, [micOn, micCooling, sendJson]);

  const onMotorMove = (direction: string) => {
    handleMotor(direction, 400);
    dispatch({ type: 'LOG', v: { level: 'info', src: 'GPIO', msg: `Motor: ${direction}` } });
  };

  const statusColors: Record<string, string> = { disconnected: '#e74c3c', connecting: '#f39c12', connected: '#2ecc71', error: '#e74c3c' };
  const statusLabels: Record<string, string> = { disconnected: 'Desconectado', connecting: 'Conectando...', connected: 'Conectado', error: 'Error' };

  const sec: React.CSSProperties = { background: '#0a0a15', borderRadius: 8, border: '0.5px solid #1e1e3a', padding: 12 };
  const hd: React.CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: '#4a5568', marginBottom: 8 };

  const connBtn = (c: string): React.CSSProperties => ({
    padding: '5px 14px', borderRadius: 6, border: `1px solid ${c}55`,
    background: `${c}15`, color: c, fontSize: 11, fontWeight: 600, cursor: 'pointer',
  });

  return (
    <div style={{ minHeight: '100vh', background: '#060610', color: '#b0b8c8', fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>

      {/* Title bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '0.5px solid #1e1e3a' }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: statusColors[state.wsState],
          boxShadow: `0 0 6px ${statusColors[state.wsState]}55`,
        }} />
        <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: 3, color: '#e2e8f0' }}>RICK</span>
        <span style={{ fontSize: 9, color: '#4a5568' }}>EMULADOR DE RASPBERRY PI</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 9, color: '#8892a4', padding: '2px 8px', border: '0.5px solid #1e1e3a', borderRadius: 4 }}>
          {state.rickState}
        </span>
        <span style={{ fontSize: 9, color: '#4a5568' }}>v2.0</span>
      </div>

      {/* Connection bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: '#08080f', borderBottom: '0.5px solid #1e1e3a' }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: statusColors[state.wsState],
          boxShadow: `0 0 6px ${statusColors[state.wsState]}66`,
        }} />
        <span style={{
          fontSize: 10, color: statusColors[state.wsState], fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: 0.5, minWidth: 90,
        }}>
          {statusLabels[state.wsState]}
        </span>
        <input
          value={state.wsUrl}
          onChange={e => dispatch({ type: 'SET', v: { wsUrl: e.target.value } })}
          placeholder="ws://localhost:3001"
          style={{
            flex: 1, padding: '5px 10px', borderRadius: 6,
            border: '1px solid #1e1e3a', background: '#0a0a14', color: '#cbd5e0',
            fontSize: 12, outline: 'none', maxWidth: 360,
          }}
        />
        {state.wsState === 'connected' ? (
          <button onClick={disconnect} style={connBtn('#e74c3c')}>Desconectar</button>
        ) : (
          <button onClick={connect} disabled={state.wsState === 'connecting'} style={connBtn('#2ecc71')}>Conectar</button>
        )}
      </div>

      {/* Info banner */}
      <div style={{ padding: '6px 16px', fontSize: 10, color: '#6b7280', borderBottom: '0.5px solid #0d0d1a', lineHeight: 1.6 }}>
        Este emulador reemplaza la Raspberry Pi. Se conecta al Node Client que se conecta al Bridge real.
        El pipeline de voz (Deepgram STT → GPT → Deepgram TTS) es real.
        Clickeá el botón del micrófono para activar/desactivar.
      </div>

      <div style={{ padding: 12 }}>
        {/* Central: Mic + OLED */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', gap: 28, padding: '14px 0 10px', flexWrap: 'wrap' }}>
          <MicButton
            active={micOn}
            level={micLevel}
            speaking={state.speakerActive}
            rickState={state.rickState}
            onToggle={toggleMic}
          />
          <OLEDScreen oled={state.oled} />
        </div>

        {/* 3-column grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>

          {/* Conversation */}
          <div style={{ ...sec, display: 'flex', flexDirection: 'column', maxHeight: 340 }}>
            <div style={hd}>Conversación</div>
            <Conversation messages={state.messages} />
          </div>

          {/* Robot movement */}
          <div style={sec}>
            <div style={hd}>Tracción diferencial (emulada)</div>
            <RobotMap motors={state.motors} pos={state.robotPos} />
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}>
              <MotorControls onMove={onMotorMove} />
            </div>
            <div style={{ marginTop: 6, fontSize: 9, color: '#4a5568', textAlign: 'center' }}>
              Controles manuales — en producción Rick se mueve via function calls
            </div>
          </div>

          {/* Logs */}
          <div style={{ ...sec, display: 'flex', flexDirection: 'column', maxHeight: 340 }}>
            <div style={hd}>Logs</div>
            <LogViewer logs={state.logs} />
          </div>
        </div>
      </div>
    </div>
  );
}
