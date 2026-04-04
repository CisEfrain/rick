import { useEffect, useRef, useCallback } from 'react';

const SAMPLE_RATE = 16000;
const BUFFER_SIZE = 4096;

const WORKLET_CODE = `
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(${BUFFER_SIZE});
    this.offset = 0;
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (let i = 0; i < input.length; i++) {
      this.buffer[this.offset++] = input[i];
      if (this.offset >= ${BUFFER_SIZE}) {
        this.port.postMessage(this.buffer.slice(0));
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
`;

export function useMicrophone(
  active: boolean,
  onAudioData: (pcm: ArrayBuffer) => void,
  onLevel?: (level: number) => void,
) {
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);

  const stopMic = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    analyserRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    contextRef.current?.close();
    contextRef.current = null;
    onLevel?.(0);
  }, [onLevel]);

  useEffect(() => {
    if (!active) {
      stopMic();
      return;
    }

    let cancelled = false;

    async function startMic() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { sampleRate: SAMPLE_RATE, channelCount: 1, echoCancellation: true, noiseSuppression: true },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;

        const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
        contextRef.current = ctx;

        const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
        const workletUrl = URL.createObjectURL(blob);
        await ctx.audioWorklet.addModule(workletUrl);
        URL.revokeObjectURL(workletUrl);

        const source = ctx.createMediaStreamSource(stream);

        // Analyser for level metering
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const workletNode = new AudioWorkletNode(ctx, 'pcm-processor');
        workletNodeRef.current = workletNode;

        workletNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
          const float32 = e.data;
          const int16 = new Int16Array(float32.length);
          for (let i = 0; i < float32.length; i++) {
            const s = Math.max(-1, Math.min(1, float32[i]));
            int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          onAudioData(int16.buffer);
        };

        source.connect(workletNode);
        workletNode.connect(ctx.destination);

        // Level metering loop
        if (onLevel) {
          const freqData = new Uint8Array(analyser.frequencyBinCount);
          function updateLevel() {
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(freqData);
            const avg = freqData.reduce((a, b) => a + b, 0) / freqData.length;
            onLevel!(Math.round(avg));
            rafRef.current = requestAnimationFrame(updateLevel);
          }
          updateLevel();
        }
      } catch (err) {
        console.error('Mic error:', err);
      }
    }

    startMic();
    return () => { cancelled = true; stopMic(); };
  }, [active, onAudioData, onLevel, stopMic]);
}
