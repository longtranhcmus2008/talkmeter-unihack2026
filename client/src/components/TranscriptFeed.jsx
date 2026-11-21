import { useState } from "react";
import PlayButton from "./PlayButton";

const clock = (ms) => {
  const s = Math.round(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export default function TranscriptFeed({ chunks, recording, segment, onRetry, onEdit, locked }) {
  const [editingIndex, setEditingIndex] = useState(null);
  const [draft, setDraft] = useState("");

  const starts = [];
  chunks.forEach((c, i) => starts.push(i === 0 ? 0 : starts[i - 1] + chunks[i - 1].durationMs));
  const end = chunks.length ? starts.at(-1) + chunks.at(-1).durationMs : 0;

  const startEdit = (c) => {
    setEditingIndex(c.index);
    setDraft(c.edited ?? c.text ?? "");
  };

  const saveEdit = (c) => {
    const text = draft.trim();
    onEdit?.(c.index, text === c.text ? undefined : text); // back to the original clears the correction
    setEditingIndex(null);
  };

  return (
    <section className="panel feed" aria-labelledby="feed-title">
      <header className="panel-head">
        <h2 id="feed-title">Lời thoại</h2>
        <span className="muted">Hiện dần sau mỗi đoạn đã trả tiền. AI nghe nhầm tên riêng thì bấm Sửa.</span>
      </header>
      {chunks.length === 0 && !recording && (
        <p className="empty">Chưa có gì. Đánh dấu ô đồng ý, đặt trần ngân sách rồi bấm Bắt đầu ghi.</p>
      )}
      <ol className="lines" aria-live="polite">
        {chunks.map((c, i) => {
          const at = clock(starts[i]);
          const isEditing = editingIndex === c.index;
          return (
            <li key={c.index} className={`line line-${c.status}`}>
              <div className="line-meta">
                <span className="line-time">{at}</span>
                {c.audioUrl && <PlayButton src={c.audioUrl} label={`đoạn ${c.index}`} />}
              </div>
              <div className="line-body">
                {c.status === "paying" && <p className="line-wait">Đang trả tiền và chuyển giọng nói…</p>}
                {(c.status === "paid" || c.status === "unconfirmed") &&
                  (isEditing ? (
                    <div className="line-edit">
                      <textarea
                        rows={3}
                        value={draft}
                        autoFocus
                        onFocus={(e) => e.target.setSelectionRange(e.target.value.length, e.target.value.length)}
                        aria-label={`Sửa lời thoại đoạn ${c.index}`}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setEditingIndex(null);
                          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) saveEdit(c);
                        }}
                      />
                      <div className="line-edit-actions">
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => saveEdit(c)}>
                          Lưu
                        </button>
                        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditingIndex(null)}>
                          Hủy
                        </button>
                        <span className="hint">Ctrl + Enter để lưu, Esc để hủy</span>
                      </div>
                    </div>
                  ) : (
                    <div className="line-text">
                      <p>{(c.edited ?? c.text) || <span className="muted">Không nghe thấy lời thoại trong đoạn này.</span>}</p>
                      <div className="line-tools">
                        {c.edited !== undefined && (
                          <span className="tag" title={`AI nghe được: ${c.text || "(trống)"}`}>
                            Đã sửa
                          </span>
                        )}
                        {!locked && onEdit && (
                          <button type="button" className="link-btn" onClick={() => startEdit(c)}>
                            Sửa<span className="sr-only"> đoạn {c.index}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
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
