import { useState } from "react";
import { short } from "../lib/money";

const VERIFY = {
  checking: "Đang đọc ReceiptLog trên chain…",
  match: "Khớp. Hash tính lại từ transcript trên màn hình trùng với hash trên chain.",
  mismatch: "Không khớp. Transcript hoặc danh sách giao dịch đã khác lúc ghi receipt.",
};

export default function ResultPanel({ meeting, contract, explorer }) {
  const [copied, setCopied] = useState(false);
  const { result, receipt, receiptError, verification } = meeting;
  if (!result) return null;

  const isInterview = result.mode === "interview";

  const formatMarkdown = () => {
    const title = isInterview ? "# BÁO CÁO ĐÁNH GIÁ PHỎNG VẤN (TALKMETER)" : "# BIÊN BẢN CUỘC HỌP (TALKMETER)";
    const lines = [title, `Ngày xuất: ${new Date().toLocaleString("vi-VN")}`, "\n## 1. Tóm tắt tổng quan", result.summary];
    if (result.decisions.length > 0) {
      lines.push(isInterview ? "\n## 2. Lưu ý & Cảnh báo thiên vị" : "\n## 2. Các nội dung đã chốt", ...result.decisions.map((d) => `- ${d}`));
    }
    if (result.action_items.length > 0) {
      lines.push(
        isInterview ? "\n## 3. Bảng chấm điểm & Câu hỏi đào sâu" : "\n## 3. Danh sách việc cần làm (Action Items)",
        ...result.action_items.map((a) =>
          isInterview
            ? `- **${a.task}** | Điểm: \`${a.owner || "N/A"}\` | Gợi ý hỏi thêm: ${a.deadline || "Không"}`
            : `- [ ] **${a.task}** — Phụ trách: *${a.owner || "Chưa rõ"}* | Hạn: \`${a.deadline || "Chưa rõ"}\``
        )
      );
    }
    if (receipt?.receiptHash) {
      lines.push("\n---", `**Xác thực On-chain (Avalanche Fuji):** \`${receipt.receiptHash}\``);
      if (receipt.explorerUrl) lines.push(`Link Snowtrace: ${receipt.explorerUrl}`);
    }
    return lines.join("\n");
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(formatMarkdown());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadMd = () => {
    const blob = new Blob([formatMarkdown()], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `talkmeter-${isInterview ? "interview" : "meeting"}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="panel result" aria-labelledby="result-title">
      <header className="panel-head">
        <h2 id="result-title">{isInterview ? "Bảng đánh giá phỏng vấn (Interviewer Copilot)" : "Kết quả cuộc họp"}</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            onClick={handleCopy}
            title="Sao chép kết quả vào bảng nhớ tạm"
            aria-label="Sao chép kết quả vào bảng nhớ tạm"
            style={{
              width: "34px",
              height: "34px",
              borderRadius: "50%",
              border: "1px solid rgba(255, 255, 255, 0.14)",
              background: "rgba(255, 255, 255, 0.06)",
              color: copied ? "#4ade80" : "inherit",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            {copied ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
          <button type="button" className="btn btn-quiet" onClick={handleDownloadMd}>
            Tải biên bản .md
          </button>
          <button type="button" className="btn btn-quiet" onClick={meeting.reset}>
            Bắt đầu phiên mới
          </button>
        </div>
      </header>

      <div className="result-grid">
        <div className="result-main">
          <p className="summary">{result.summary}</p>
          {result.decisions.length > 0 && (
            <>
              <h3>{isInterview ? "Lưu ý & Cảnh báo thiên vị" : "Đã chốt"}</h3>
              <ul className="decisions">
                {result.decisions.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </>
          )}
          <h3>{isInterview ? "Bảng chấm điểm & Câu hỏi đào sâu" : "Việc cần làm"}</h3>
          {result.action_items.length === 0 ? (
            <p className="muted">Không có mục nào được trích xuất.</p>
          ) : (
            <table className="actions">
              <thead>
                <tr>
                  <th scope="col">{isInterview ? "Tiêu chí & Nhận xét" : "Việc"}</th>
                  <th scope="col">{isInterview ? "Điểm" : "Người làm"}</th>
                  <th scope="col">{isInterview ? "Gợi ý câu hỏi đào sâu" : "Hạn"}</th>
                  <th scope="col">Câu gốc</th>
                </tr>
              </thead>
              <tbody>
                {result.action_items.map((a, i) => (
                  <tr key={i}>
                    <td data-label="Việc">{a.task}</td>
                    <td data-label="Người làm">{a.owner || <span className="muted">Chưa rõ</span>}</td>
                    <td data-label="Hạn" className={isInterview ? "" : "nowrap"}>
                      {a.deadline || <span className="muted">Chưa rõ</span>}
                    </td>
                    <td data-label="Câu gốc">{a.quote && <q>{a.quote}</q>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="receipt">
          <h3>Receipt on-chain</h3>
          {receipt ? (
            <>
              <p className="muted">Một hash cho toàn bộ transcript và giao dịch của phiên. Nội dung cuộc họp không lên chain.</p>
              <code className="receipt-hash">{receipt.receiptHash}</code>
              {receipt.explorerUrl && (
                <a className="btn btn-ghost" href={receipt.explorerUrl} target="_blank" rel="noreferrer">
                  Xem giao dịch receipt trên Snowtrace
                </a>
              )}
              {contract && (
                <a className="contract" href={`${explorer}/address/${contract}`} target="_blank" rel="noreferrer">
                  Contract ReceiptLog {short(contract, 8, 6)}
                </a>
              )}
              <div className="receipt-actions">
                <button type="button" className="btn btn-primary" onClick={meeting.verify} disabled={verification?.state === "checking"}>
                  Kiểm chứng trên chain
                </button>
                <button type="button" className="btn btn-quiet" onClick={meeting.exportReceipt}>
                  Tải biên lai .json
                </button>
              </div>
              {verification && (
                <p className={`verify verify-${verification.state}`} role="status">
                  {VERIFY[verification.state] || `Không đọc được chain: ${verification.error}`}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="line-note">{receiptError}</p>
              {contract && (
                <button type="button" className="btn btn-ghost" onClick={meeting.retryReceipt}>
                  Thử ghi lại receipt
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
