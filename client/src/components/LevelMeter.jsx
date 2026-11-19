// Live mic level, so people in the room can see TalkMeter is listening.
import { useEffect, useRef } from "react";

export default function LevelMeter({ stream }) {
  const canvas = useRef(null);
  useEffect(() => {
    if (!stream || !canvas.current) return;
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const c = canvas.current;
    const g = c.getContext("2d");
    const bars = 28;
    let frame;
    const draw = () => {
      analyser.getByteFrequencyData(data);
      const { width, height } = c;
      g.clearRect(0, 0, width, height);
      const w = width / bars;
      for (let i = 0; i < bars; i++) {
        const v = data[Math.floor((i / bars) * data.length * 0.7)] / 255;
        const h = Math.max(2, v * height);
        g.fillStyle = v > 0.55 ? "#E84142" : "#E8E4DA";
        g.globalAlpha = 0.35 + v * 0.65;
        g.fillRect(i * w + 1, (height - h) / 2, w - 2, h);
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(frame);
      ctx.close();
    };
  }, [stream]);
  return <canvas ref={canvas} className="level" width="224" height="36" aria-hidden="true" />;
}
