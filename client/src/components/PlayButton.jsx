import { useEffect, useRef, useState } from "react";

export default function PlayButton({ src, label }) {
  const audio = useRef(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => audio.current?.pause(), []);
  const toggle = () => {
    if (!audio.current) {
      audio.current = new Audio(src);
      audio.current.onended = () => setPlaying(false);
    }
    if (playing) audio.current.pause();
    else audio.current.play();
    setPlaying(!playing);
  };
  return (
    <button type="button" className="icon-btn" onClick={toggle} aria-label={playing ? `Dừng ${label}` : `Nghe lại ${label}`}>
      {playing ? (
        <svg viewBox="0 0 16 16" width="14" height="14"><rect x="3" y="3" width="3.5" height="10" rx="1" /><rect x="9.5" y="3" width="3.5" height="10" rx="1" /></svg>
      ) : (
        <svg viewBox="0 0 16 16" width="14" height="14"><path d="M4 2.8v10.4a.8.8 0 0 0 1.2.7l8.6-5.2a.8.8 0 0 0 0-1.4L5.2 2.1A.8.8 0 0 0 4 2.8Z" /></svg>
      )}
    </button>
  );
}
