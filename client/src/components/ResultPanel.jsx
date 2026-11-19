import { short } from "../lib/money";

const VERIFY = {
  checking: "Đang đọc ReceiptLog trên chain…",
  match: "Khớp. Hash tính lại từ transcript trên màn hình trùng với hash trên chain.",
  mismatch: "Không khớp. Transcript hoặc danh sách giao dịch đã khác lúc ghi receipt.",
};

export default function ResultPanel({ meeting, contract, explorer }) {
  const { result, receipt, receiptError, verification } = meeting;
  if (!result) return null;
  return (
    <section className="panel result" aria-labelledby="result-title">
      <header className="panel-head">
        <h2 id="result-title">Kết quả cuộc họp</h2>
        <button type="button" className="btn btn-quiet" onClick={meeting.reset}>
          Bắt đầu phiên mới
        </button>
      </header>

      <div className="result-grid">
        <div className="result-main">
          <p className="summary">{result.summary}</p>
          {result.decisions.length > 0 && (
            <>
              <h3>Đã chốt</h3>
              <ul className="decisions">
                {result.decisions.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </>
          )}
          <h3>Việc cần làm</h3>
          {result.action_items.length === 0 ? (
            <p className="muted">Cuộc họp không giao việc cụ thể cho ai.</p>
          ) : (
            <table className="actions">
              <thead>
                <tr>
                  <th scope="col">Việc</th>
                  <th scope="col">Người làm</th>
                  <th scope="col">Hạn</th>
                  <th scope="col">Câu gốc</th>
                </tr>
              </thead>
              <tbody>
                {result.action_items.map((a, i) => (
                  <tr key={i}>
                    <td data-label="Việc">{a.task}</td>
                    <td data-label="Người làm">{a.owner || <span className="muted">Chưa rõ</span>}</td>
                    <td data-label="Hạn" className="nowrap">
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
