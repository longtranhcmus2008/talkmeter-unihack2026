import PlayButton from "./PlayButton";

const clock = (ms) => {
  const s = Math.round(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export default function TranscriptFeed({ chunks, recording, segment, onRetry }) {
  // Start time of each chunk inside the meeting, from the lengths of the chunks before it.
  const starts = [];
  chunks.forEach((c, i) => starts.push(i === 0 ? 0 : starts[i - 1] + chunks[i - 1].durationMs));
  const end = chunks.length ? starts.at(-1) + chunks.at(-1).durationMs : 0;
  return (
    <section className="panel feed" aria-labelledby="feed-title">
      <header className="panel-head">
        <h2 id="feed-title">Lời thoại</h2>
        <span className="muted">Hiện dần sau mỗi đoạn đã trả tiền</span>
      </header>
      {chunks.length === 0 && !recording && (
        <p className="empty">Chưa có gì. Đánh dấu ô đồng ý, đặt trần ngân sách rồi bấm Bắt đầu ghi.</p>
      )}
      <ol className="lines" aria-live="polite">
        {chunks.map((c, i) => {
          const at = clock(starts[i]);
          return (
            <li key={c.index} className={`line line-${c.status}`}>
              <div className="line-meta">
                <span className="line-time">{at}</span>
                {c.audioUrl && <PlayButton src={c.audioUrl} label={`đoạn ${c.index}`} />}
              </div>
              <div className="line-body">
                {c.status === "paying" && <p className="line-wait">Đang trả tiền và chuyển giọng nói…</p>}
                {(c.status === "paid" || c.status === "unconfirmed") && (
                  <p>{c.text || <span className="muted">Không nghe thấy lời thoại trong đoạn này.</span>}</p>
                )}
                {c.status === "unconfirmed" && (
                  <p className="line-note">Server không gửi lại mã giao dịch, nên đoạn này không được đưa vào receipt.</p>
                )}
                {c.status === "failed" && (
                  <div className="line-error">
                    <p>{c.error}</p>
                    <button type="button" className="btn btn-quiet" onClick={() => onRetry(c.index)}>
                      Thử lại đoạn {c.index}
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
        {recording && segment && (
          <li className="line line-recording">
            <div className="line-meta">
              <span className="line-time">{clock(end)}</span>
            </div>
            <div className="line-body">
              <p className="line-wait">
                <i className="rec-dot" />
                Đang nghe đoạn {segment.index}
              </p>
            </div>
          </li>
        )}
      </ol>
    </section>
  );
}
