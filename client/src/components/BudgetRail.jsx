// The budget as a track: settled minutes, minutes still paying, the one being recorded,
// and the slice kept back for the summary. Recording stops before the next minute would eat into it.
import { fmt } from "../lib/money";

export default function BudgetRail({ budget, paid, pending, live, summaryMicro, priceMicro }) {
  if (!budget) return null;
  const pct = (micro) => `${Math.min(100, (micro / budget) * 100)}%`;
  const ticks = Math.floor((budget - summaryMicro) / priceMicro);
  return (
    <div className="rail-wrap">
      <div className="rail" aria-hidden="true">
        <span className="rail-paid" style={{ width: pct(paid) }} />
        <span className="rail-pending" style={{ left: pct(paid), width: pct(pending) }} />
        {live > 0 && <span className="rail-live" style={{ left: pct(paid + pending), width: pct(live) }} />}
        <span className="rail-reserve" style={{ width: pct(summaryMicro) }} />
        {Array.from({ length: Math.max(0, ticks - 1) }, (_, i) => (
          <span key={i} className="rail-tick" style={{ left: pct((i + 1) * priceMicro) }} />
        ))}
      </div>
      <div className="rail-legend">
        <span><i className="key key-paid" />Đã settle {fmt(paid, 2)}</span>
        {pending > 0 && <span><i className="key key-pending" />Đang xử lý {fmt(pending, 2)}</span>}
        <span><i className="key key-reserve" />Giữ cho tóm tắt {fmt(summaryMicro, 2)}</span>
        <span className="rail-cap">Trần {fmt(budget, 2)} USDC</span>
      </div>
    </div>
  );
}
