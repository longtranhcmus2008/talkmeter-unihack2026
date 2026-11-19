// Every paid chunk as a ticket stub with its own transaction, the way a meter prints receipts.
import { fmt, short } from "../lib/money";

const STATUS = { paying: "Đang settle", paid: "Đã settle", unconfirmed: "Chưa xác nhận", failed: "Không trừ tiền" };

function Stub({ title, amount, status, tone, href, hash }) {
  return (
    <li className={`stub stub-${tone}`}>
      <div className="stub-row">
        <strong>{title}</strong>
        <span className="stub-amount">{amount}</span>
      </div>
      <div className="stub-row">
        <span className="stub-status">{status}</span>
        {hash && (
          <a className="hash" href={href} target="_blank" rel="noreferrer">
            {short(hash)}
            <span className="sr-only"> (mở trên Snowtrace)</span>
          </a>
        )}
      </div>
    </li>
  );
}

export default function TicketStrip({ chunks, priceMicro, summaryMicro, explorer, result, receipt }) {
  const link = (hash) => `${explorer}/tx/${hash}`;
  return (
    <aside className="panel tickets" aria-labelledby="tickets-title">
      <header className="panel-head">
        <h2 id="tickets-title">Vé thanh toán</h2>
        <span className="muted">Mỗi đoạn một giao dịch</span>
      </header>
      {chunks.length === 0 && <p className="empty">Giao dịch USDC của từng đoạn sẽ hiện ở đây, kèm link Snowtrace.</p>}
      <ul className="stubs">
        {chunks.map((c) => (
          <Stub
            key={c.index}
            title={`Đoạn ${c.index}`}
            amount={`${c.status === "failed" ? "0.00" : fmt(priceMicro, 2)} USDC`}
            status={STATUS[c.status]}
            tone={c.status}
            hash={c.txHash}
            href={link(c.txHash)}
          />
        ))}
        {result && (
          <Stub
            title="Bản tóm tắt"
            amount={`${fmt(summaryMicro, 2)} USDC`}
            status="Đã settle"
            tone="paid"
            hash={result.summaryTx}
            href={link(result.summaryTx)}
          />
        )}
        {receipt?.txHash && (
          <Stub title="Receipt cả phiên" amount="ReceiptLog" status="Ghi on-chain" tone="receipt" hash={receipt.txHash} href={receipt.explorerUrl} />
        )}
      </ul>
    </aside>
  );
}
