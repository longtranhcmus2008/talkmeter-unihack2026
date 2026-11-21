import { useCallback, useEffect, useState } from "react";
import { loadSessionWallet, newSessionWallet, publicClientFor, usdcBalance } from "./lib/x402Client";
import { fmt, toMicro } from "./lib/money";
import { useMeeting } from "./hooks/useMeeting";
import Odometer from "./components/Odometer";
import BudgetRail from "./components/BudgetRail";
import LevelMeter from "./components/LevelMeter";
import TranscriptFeed from "./components/TranscriptFeed";
import TicketStrip from "./components/TicketStrip";
import ResultPanel from "./components/ResultPanel";
import WalletChip from "./components/WalletChip";
import HowItWorks from "./components/HowItWorks";

const BUDGET_PRESETS = ["0.10", "0.25", "0.50", "1.00"];

const elapsed = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

function useNow(active) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export default function App() {
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState(false);
  const [wallet, setWallet] = useState(() => loadSessionWallet());
  const [balance, setBalance] = useState(null);
  const [consent, setConsent] = useState(false);
  const [budget, setBudget] = useState("0.25");
  const [chunkSeconds, setChunkSeconds] = useState(60);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setConfig)
      .catch(() => setConfigError(true));
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!config) return;
    try {
      setBalance(await usdcBalance(publicClientFor(config.network), config.network, wallet.address));
    } catch {
      /* RPC hiccup: keep the last value */
    }
  }, [config, wallet.address]);

  useEffect(() => {
    refreshBalance();
    const id = setInterval(refreshBalance, 8000);
    return () => clearInterval(id);
  }, [refreshBalance]);

  const meeting = useMeeting({ config, wallet, onPaid: refreshBalance });
  const recording = meeting.phase === "recording";
  const now = useNow(recording);

  if (configError) {
    return (
      <div className="boot">
        <Brand />
        <p>Không kết nối được server TalkMeter.</p>
        <p className="muted">Chạy <code>npm run server</code> (và <code>npm run client</code> nếu đang dev), rồi tải lại trang.</p>
      </div>
    );
  }
  if (!config) return <div className="boot"><Brand /><p className="muted">Đang tải cấu hình…</p></div>;

  const { priceMicro, summaryMicro } = meeting;
  const chunks = meeting.chunks;
  const settled = chunks.filter((c) => c.status === "paid").length * priceMicro + (meeting.result ? summaryMicro : 0);
  const pending = chunks.filter((c) => c.status === "paying" || c.status === "unconfirmed").length * priceMicro;
  const live =
    recording && meeting.segment ? Math.min(1, (now - meeting.segment.startedAt) / meeting.chunkMs) * priceMicro : 0;
  const shown = settled + pending + live;
  const railBudget = meeting.phase === "idle" ? toMicro(budget) : meeting.budget;
  const lowBalance = balance !== null && balance * 1e6 < priceMicro + summaryMicro;
  const minutes = chunkSeconds === 60 ? "phút" : `${chunkSeconds} giây`;

  return (
    <>
      <header className="topbar">
        <Brand />
        <div className="topbar-right">
          <span className={`net net-${config.network.key}`}>
            {config.network.name}
            {config.network.key === "fuji" && <span className="muted"> testnet</span>}
          </span>
          <WalletChip
            wallet={wallet}
            balance={balance}
            network={config.network}
            locked={recording || meeting.phase === "summarizing"}
            onNewWallet={() => {
              setWallet(newSessionWallet());
              setBalance(null);
            }}
          />
        </div>
      </header>

      <main className="deck">
        <section className={`panel meter ${recording ? "is-live" : ""}`} aria-labelledby="meter-title">
          <h1 id="meter-title" className="meter-title">
            {recording ? "Đang tính tiền" : meeting.phase === "done" ? "Tổng phiên này" : "Họp bao nhiêu, trả bấy nhiêu"}
          </h1>
          <div className="meter-readout">
            <Odometer value={fmt(shown, 4)} label={`${fmt(shown, 4)} USDC`} />
            <span className="meter-unit">USDC</span>
          </div>
          <BudgetRail
            budget={railBudget}
            paid={settled - (meeting.result ? summaryMicro : 0)}
            pending={pending}
            live={live}
            summaryMicro={summaryMicro}
            priceMicro={priceMicro}
          />
          <dl className="meter-stats">
            <div>
              <dt>Thời gian</dt>
              <dd>{meeting.startedAt ? elapsed(now - meeting.startedAt) : "00:00"}</dd>
            </div>
            <div>
              <dt>Đoạn đã trả</dt>
              <dd>{chunks.filter((c) => c.status === "paid").length}</dd>
            </div>
            <div>
              <dt>Giá</dt>
              <dd>
                {config.prices.transcribe} / {minutes}
              </dd>
            </div>
            <div className="meter-level">
              <dt>{recording ? <><i className="rec-dot" />Mic đang mở</> : "Mic tắt"}</dt>
              <dd>{meeting.stream ? <LevelMeter stream={meeting.stream} /> : <span className="level-off" />}</dd>
            </div>
          </dl>
        </section>

        <section className="panel control" aria-labelledby="control-title">
          <h2 id="control-title" className="sr-only">Điều khiển phiên</h2>
          {meeting.phase === "idle" && (
            <>
              <label className={`consent ${consent ? "is-on" : ""}`}>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>
                  <strong>Mọi người trong cuộc họp đã đồng ý được ghi âm.</strong> Âm thanh được AI chuyển thành văn bản và tóm tắt,
                  server không lưu file âm thanh. Chỉ hash của biên lai được ghi lên blockchain.
                </span>
              </label>

              <fieldset className="field">
                <legend>Trần ngân sách cho phiên</legend>
                <div className="budget-input">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    aria-label="Trần ngân sách, USDC"
                  />
                  <span>USDC</span>
                </div>
                <div className="presets">
                  {BUDGET_PRESETS.map((p) => (
                    <button key={p} type="button" className={budget === p ? "is-on" : ""} onClick={() => setBudget(p)}>
                      {p}
                    </button>
                  ))}
                </div>
                <p className="hint">
                  Đủ cho khoảng {Math.max(0, Math.floor((toMicro(budget) - summaryMicro) / priceMicro))} đoạn và một bản tóm tắt.
                </p>
              </fieldset>

              <fieldset className="field">
                <legend>Độ dài mỗi đoạn</legend>
                <div className="segmented">
                  {[
                    [60, "60 giây", "Họp thật"],
                    [15, "15 giây", "Quay demo"],
                  ].map(([s, label, note]) => (
                    <label key={s} className={chunkSeconds === s ? "is-on" : ""}>
                      <input type="radio" name="chunk" checked={chunkSeconds === s} onChange={() => setChunkSeconds(s)} />
                      <strong>{label}</strong>
                      <span>{note}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {lowBalance && (
                <p className="callout callout-warn">
                  Ví phiên chưa đủ USDC. Mở ví ở góc trên, copy địa chỉ rồi lấy USDC test tại faucet Circle (chọn Avalanche Fuji).
                </p>
              )}

              <button
                type="button"
                className="btn btn-record"
                disabled={!consent}
                onClick={() => meeting.start({ budgetUsdc: budget, chunkSeconds })}
              >
                <i className="rec-dot" />
                Bắt đầu ghi
              </button>
              {!consent && <p className="hint">Đánh dấu ô đồng ý để bật mic.</p>}
            </>
          )}

          {recording && (
            <>
              <p className="live-line">
                <i className="rec-dot" />
                Đang ghi âm. Mic tự tắt trước khi chạm trần {fmt(meeting.budget, 2)} USDC.
              </p>
              <button type="button" className="btn btn-stop" onClick={meeting.stop}>
                Dừng ghi
              </button>
            </>
          )}

          {(meeting.phase === "stopped" || meeting.phase === "summarizing") && (
            <>
              <p className="live-line">
                {chunks.filter((c) => c.status === "paid").length} đoạn đã trả tiền. Chọn chế độ phân tích ({config.prices.summary} USDC) và ghi receipt lên chain:
              </p>
              <div style={{ display: "grid", gap: "8px", width: "100%" }}>
                <button
                  type="button"
                  className="btn btn-primary btn-wide"
                  disabled={meeting.busy || meeting.phase === "summarizing"}
                  onClick={() => meeting.finalize("meeting")}
                >
                  {meeting.phase === "summarizing"
                    ? "Đang phân tích và ghi receipt…"
                    : meeting.busy
                      ? "Chờ các đoạn đang xử lý…"
                      : `Họp nhóm: Tóm tắt & Việc cần làm (${config.prices.summary} USDC)`}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-wide"
                  disabled={meeting.busy || meeting.phase === "summarizing"}
                  onClick={() => meeting.finalize("interview")}
                >
                  {meeting.phase === "summarizing"
                    ? "Đang phân tích và ghi receipt…"
                    : `Phỏng vấn: Chấm điểm & Cảnh báo thiên vị (${config.prices.summary} USDC)`}
                </button>
              </div>
              <button type="button" className="btn btn-quiet" onClick={meeting.reset} disabled={meeting.phase === "summarizing"}>
                Bỏ phiên này
              </button>
            </>
          )}

          {meeting.phase === "done" && (
            <button type="button" className="btn btn-quiet btn-wide" onClick={meeting.reset}>
              Bắt đầu phiên mới
            </button>
          )}

          {meeting.notice && (
            <p className={`callout callout-${meeting.notice.tone}`} role="status">
              {meeting.notice.text}
            </p>
          )}
        </section>

        <TranscriptFeed
          chunks={chunks}
          recording={recording}
          segment={meeting.segment}
          onRetry={meeting.retry}
          onEdit={meeting.editChunk}
          locked={meeting.phase === "summarizing" || meeting.phase === "done"}
        />
        <TicketStrip
          chunks={chunks}
          priceMicro={priceMicro}
          summaryMicro={summaryMicro}
          explorer={config.network.explorer}
          result={meeting.result}
          receipt={meeting.receipt}
        />
        <ResultPanel meeting={meeting} contract={config.receiptContract} explorer={config.network.explorer} />
        <HowItWorks price={config.prices.transcribe} network={config.network.name} />
      </main>

      <footer className="foot">
        <p>
          Bản demo chạy trên {config.network.name} với USDC thử nghiệm, không có giá trị thật. Tại Việt Nam, USDC chưa phải phương
          tiện thanh toán hợp pháp; bản thương mại sẽ thu bằng đồng Việt Nam qua trung gian được cấp phép và chỉ dùng chain để ghi biên lai.
        </p>
        <p className="muted">TalkMeter, Team1 Vietnam UniHack 2026, Topic 19.</p>
      </footer>
    </>
  );
}

function Brand() {
  const editChunk = (index, newText) => {
    update(index, { text: newText, transcriptHash: textHash(newText) });
  };
  return (
    editChunk,
    <div className="brand">
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
        <path d="M6 21a10 10 0 0 1 20 0" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M16 21 22 12" stroke="#E84142" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="16" cy="21" r="2.4" fill="#E84142" />
      </svg>
      <span>TalkMeter</span>
    </div>
  );
}
