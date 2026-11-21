// A strip of the mic level scrolling left, with a red mark where each paid chunk begins:
// people in the room see TalkMeter listening, and see where every 0.02 USDC starts.
import { useEffect, useRef } from "react";

const STEP = 5; // css px per sample
const SAMPLE_MS = 90; // ~55 px per second: a 15 s chunk spans most of the strip

export default function Waveform({ stream, segment, price, idle }) {
  const canvas = useRef(null);
  const s = useRef({ samples: [], mark: null }).current; // samples: { v, mark } newest last

  // Each new chunk puts a marker on the next sample.
  useEffect(() => {
    if (segment) s.mark = segment.index;
  }, [segment?.index]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const c = canvas.current;
    const g = c.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    const draw = () => {
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (c.width !== Math.round(w * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const mid = h / 2 + 6;
      const room = h - 26;
      const visible = Math.floor(w / STEP);
      const list = s.samples.slice(-visible);
      const x0 = w - list.length * STEP;

      // baseline dots where there is no sound yet
      g.fillStyle = "rgba(232,228,218,0.16)";
      for (let x = 0; x < x0; x += STEP) g.fillRect(x + 1, mid - 0.5, 1.5, 1);

      list.forEach(({ v, mark }, i) => {
        const x = x0 + i * STEP;
        if (mark != null) {
          g.fillStyle = "#E84142";
          g.fillRect(x, 4, 1, h - 4);
          g.font = "600 12px 'Barlow Condensed', sans-serif";
          g.fillText(`#${mark} · ${price}`, x + 5, 14);
        }
        const bar = Math.max(1.5, v * room);
        g.globalAlpha = 0.3 + v * 0.7;
        g.fillStyle = v > 0.6 ? "#E84142" : "#E8E4DA";
        g.fillRect(x + 1, mid - bar / 2, STEP - 2, bar);
        g.globalAlpha = 1;
      });
    };

    if (!stream) {
      if (idle) s.samples = [];
      draw(); // frozen strip of the last session, or the empty baseline
      const ro = new ResizeObserver(draw);
      ro.observe(c);
      return () => ro.disconnect();
    }

    s.samples = [];
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    // The strip moves one bar per sample, so redrawing between samples would add nothing.
    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const d of data) sum += ((d - 128) / 128) ** 2;
      const v = Math.min(1, Math.sqrt(sum / data.length) * 4.5);
      s.samples.push({ v, mark: s.mark });
      s.mark = null;
      if (s.samples.length > 2000) s.samples.splice(0, 1000);
      draw();
    }, SAMPLE_MS);
    return () => {
      clearInterval(timer);
      ctx.close();
    };
  }, [stream, price, idle]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`wave ${stream ? "is-live" : ""}`}>
      <canvas ref={canvas} aria-hidden="true" />
      {idle && <p className="wave-idle">Sóng âm chạy ở đây khi mic mở. Mỗi vạch đỏ là một đoạn được tính tiền.</p>}
    </div>
  );
}
