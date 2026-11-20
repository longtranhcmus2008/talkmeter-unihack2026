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
    setDraft(c.text || "");
  };

  const saveEdit = (index) => {
    onEdit?.(index, draft.trim());
    setEditingIndex(null);
  };

  return (
    <section className="panel feed" aria-labelledby="feed-title">
      <header className="panel-head">
        <h2 id="feed-title">Lời thoại</h2>
        <span className="muted">Hiện dần sau mỗi đoạn đã trả tiền (bấm Sửa nếu AI nghe nhầm tên riêng)</span>
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
                {!locked && !isEditing && (c.status === "paid" || c.status === "unconfirmed") && onEdit && (
                  <button
                    type="button"
                    className="btn btn-quiet"
                    style={{ padding: "2px 8px", fontSize: "12px", marginLeft: "auto" }}
                    onClick={() => startEdit(c)}
                  >
                    Sửa
                  </button>
                )}
              </div>
              <div className="line-body">
                {c.status === "paying" && <p className="line-wait">Đang trả tiền và chuyển giọng nói…</p>}
                {(c.status === "paid" || c.status === "unconfirmed") &&
                  (isEditing ? (
                    <div style={{ display: "grid", gap: "8px" }}>
                      <textarea
                        rows={2}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px",
                          borderRadius: "8px",
                          border: "1px solid rgba(255,255,255,0.2)",
                          background: "rgba(0,0,0,0.25)",
                          color: "inherit",
                          font: "inherit",
                        }}
                      />
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button type="button" className="btn btn-primary" style={{ padding: "4px 12px" }} onClick={() => saveEdit(c.index)}>
                          Lưu
                        </button>
                        <button type="button" className="btn btn-quiet" style={{ padding: "4px 12px" }} onClick={() => setEditingIndex(null)}>
                          Hủy
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p>{c.text || <span className="muted">Không nghe thấy lời thoại trong đoạn này.</span>}</p>
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
