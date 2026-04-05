import { useReducer, useEffect, useRef, useCallback } from 'react';

export interface OLEDState {
  state: string;
  extra?: string;
}

export interface MotorState {
  left: number;
  right: number;
}

export interface RobotPos {
  x: number;
  y: number;
  angle: number;
}

export interface ChatMessage {
  role: 'user' | 'rick';
  text: string;
  ts: number;
  latency?: number;
}

export interface LogEntry {
  ts: number;
  level: string;
  src: string;
  msg: string;
}

export interface EmulatorState {
  wsUrl: string;
  wsState: 'disconnected' | 'connecting' | 'connected' | 'error';
  rickState: string;
  oled: OLEDState;
  micActive: boolean;
  speakerActive: boolean;
  transcript: string;
  motors: MotorState;
  robotPos: RobotPos;
  messages: ChatMessage[];
  logs: LogEntry[];
}

type Action =
  | { type: 'SET'; v: Partial<EmulatorState> }
  | { type: 'OLED'; v: OLEDState }
  | { type: 'MOTORS'; v: MotorState }
  | { type: 'POS'; v: RobotPos }
  | { type: 'MSG'; v: ChatMessage }
  | { type: 'LOG'; v: Omit<LogEntry, 'ts'> };

const initial: EmulatorState = {
  wsUrl: `ws://localhost:${import.meta.env.VITE_FRONTEND_WS_PORT || '3001'}`,
  wsState: 'disconnected',
  rickState: 'IDLE',
  oled: { state: 'DISCONNECTED' },
  micActive: false,
  speakerActive: false,
  transcript: '',
  motors: { left: 0, right: 0 },
  robotPos: { x: 150, y: 100, angle: 0 },
  messages: [],
  logs: [],
};

function reducer(s: EmulatorState, a: Action): EmulatorState {
  switch (a.type) {
    case 'SET': return { ...s, ...a.v };
    case 'OLED': return { ...s, oled: a.v };
    case 'MOTORS': return { ...s, motors: a.v };
    case 'POS': return { ...s, robotPos: a.v };
    case 'MSG': return { ...s, messages: [...s.messages.slice(-50), a.v] };
    case 'LOG': return { ...s, logs: [...s.logs.slice(-200), { ts: Date.now(), ...a.v }] };
    default: return s;
  }
}

const DIRECTION_DELTAS: Record<string, { dx: number; dy: number; da: number }> = {
  adelante: { dx: 0, dy: -12, da: 0 },
  atras: { dx: 0, dy: 12, da: 0 },
  izquierda: { dx: -10, dy: 0, da: -15 },
  derecha: { dx: 10, dy: 0, da: 15 },
  girar: { dx: 0, dy: 0, da: 45 },
};

const MOTOR_VALUES: Record<string, { left: number; right: number }> = {
  adelante: { left: 80, right: 80 },
  atras: { left: -80, right: -80 },
  izquierda: { left: 0, right: 80 },
  derecha: { left: 80, right: 0 },
  girar: { left: 80, right: -80 },
};

export function useEmulatorSocket() {
  const [state, dispatch] = useReducer(reducer, initial);
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const pendingBuffersRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const playNextAudio = useCallback(async () => {
    if (isPlayingRef.current || pendingBuffersRef.current.length === 0) return;
    isPlayingRef.current = true;

    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext({ sampleRate: 16000 });
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') await ctx.resume();

    const buffers = pendingBuffersRef.current.splice(0);
    let totalLen = 0;
    for (const b of buffers) totalLen += b.byteLength;
    const merged = new Int16Array(totalLen / 2);
    let offset = 0;
    for (const b of buffers) {
      const view = new Int16Array(b);
      merged.set(view, offset);
      offset += view.length;
    }

    const float32 = new Float32Array(merged.length);
    for (let i = 0; i < merged.length; i++) float32[i] = merged[i] / 32768;

    const audioBuffer = ctx.createBuffer(1, float32.length, 16000);
    audioBuffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.onended = () => {
      isPlayingRef.current = false;
      if (pendingBuffersRef.current.length > 0) {
        playNextAudio();
      } else {
        wsRef.current?.send(JSON.stringify({ type: 'playback_done' }));
        dispatch({ type: 'SET', v: { speakerActive: false } });
      }
    };
    source.start();
  }, []);

  const handleMotor = useCallback((direction: string, duration: number) => {
    const m = MOTOR_VALUES[direction] || { left: 0, right: 0 };
    const d = DIRECTION_DELTAS[direction] || { dx: 0, dy: 0, da: 0 };
    dispatch({ type: 'MOTORS', v: m });
    setTimeout(() => {
      dispatch({ type: 'MOTORS', v: { left: 0, right: 0 } });
      const pos = stateRef.current.robotPos;
      dispatch({ type: 'POS', v: {
        x: Math.max(8, Math.min(292, pos.x + d.dx)),
        y: Math.max(8, Math.min(192, pos.y + d.dy)),
        angle: pos.angle + d.da,
      } });
    }, Math.min(duration, 3000));
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current) wsRef.current.close();
    dispatch({ type: 'SET', v: { wsState: 'connecting' } });
    dispatch({ type: 'LOG', v: { level: 'info', src: 'WS', msg: `Conectando a ${stateRef.current.wsUrl}...` } });

    const ws = new WebSocket(stateRef.current.wsUrl);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      dispatch({ type: 'SET', v: { wsState: 'connected' } });
      dispatch({ type: 'LOG', v: { level: 'success', src: 'WS', msg: 'Conectado al Node Client' } });
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        pendingBuffersRef.current.push(event.data);
        dispatch({ type: 'SET', v: { speakerActive: true } });
        if (!isPlayingRef.current) playNextAudio();
        return;
      }

      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'oled':
            dispatch({ type: 'OLED', v: { state: msg.state, extra: msg.extra } });
            dispatch({ type: 'SET', v: { rickState: msg.state } });
            break;
          case 'motor':
            handleMotor(msg.direction, msg.duration);
            dispatch({ type: 'LOG', v: { level: 'info', src: 'MOTOR', msg: `${msg.direction} (${msg.duration}ms)` } });
            break;
          case 'mic_start':
            dispatch({ type: 'SET', v: { micActive: true } });
            dispatch({ type: 'LOG', v: { level: 'info', src: 'MIC', msg: 'Captura iniciada' } });
            break;
          case 'mic_stop':
            dispatch({ type: 'SET', v: { micActive: false } });
            dispatch({ type: 'LOG', v: { level: 'info', src: 'MIC', msg: 'Captura detenida' } });
            break;
          case 'transcript':
            dispatch({ type: 'SET', v: { transcript: msg.text || '' } });
            break;
          case 'message':
            dispatch({ type: 'MSG', v: { role: msg.role, text: msg.text, ts: Date.now(), latency: msg.latency } });
            break;
          case 'speaking_start':
            dispatch({ type: 'SET', v: { speakerActive: true, rickState: 'SPEAKING' } });
            dispatch({ type: 'OLED', v: { state: 'SPEAKING', extra: '' } });
            break;
          case 'speaking_done':
            break;
          case 'log':
            dispatch({ type: 'LOG', v: { level: msg.level || 'info', src: msg.src || 'SYS', msg: msg.msg || '' } });
            break;
          case 'playback_flush':
            break;
          case 'playback_stop':
            pendingBuffersRef.current = [];
            isPlayingRef.current = false;
            dispatch({ type: 'SET', v: { speakerActive: false } });
            break;
        }
      } catch { /* ignore */ }
    };

    ws.onerror = () => {
      dispatch({ type: 'SET', v: { wsState: 'error' } });
    };

    ws.onclose = (e) => {
      dispatch({ type: 'SET', v: { wsState: 'disconnected' } });
      dispatch({ type: 'LOG', v: { level: 'warn', src: 'WS', msg: `Desconectado (code: ${e.code})` } });
    };
  }, [playNextAudio, handleMotor]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  const sendBinary = useCallback((data: ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(data);
  }, []);

  const sendJson = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg));
  }, []);

  useEffect(() => {
    return () => { wsRef.current?.close(); audioCtxRef.current?.close(); };
  }, []);

  return { state, dispatch, connect, disconnect, sendBinary, sendJson, handleMotor };
}
