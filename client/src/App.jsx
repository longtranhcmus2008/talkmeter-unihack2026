import { useCallback, useEffect, useState } from "react";
import { loadSessionWallet, newSessionWallet, publicClientFor, usdcBalance } from "./lib/x402Client";
import { fmt, toMicro } from "./lib/money";
import { useMeeting } from "./hooks/useMeeting";
import Odometer from "./components/Odometer";
import BudgetRail from "./components/BudgetRail";
import Waveform from "./components/Waveform";
import TranscriptFeed from "./components/TranscriptFeed";
import TicketStrip from "./components/TicketStrip";
import ResultPanel from "./components/ResultPanel";
import WalletChip from "./components/WalletChip";
import HowItWorks from "./components/HowItWorks";

const BUDGET_PRESETS = ["0.10", "0.25", "0.50", "1.00"];
const CHUNKS = [
  [60, "60 giây", "Họp thật"],
  [15, "15 giây", "Quay demo"],
];
const MODES = [
  ["meeting", "Họp nhóm", "Tóm tắt, quyết định, việc cần làm"],
  ["interview", "Phỏng vấn", "Chấm điểm, cảnh báo câu hỏi thiên vị"],
];

function Segmented({ name, options, value, onChange, disabled }) {
  return (
    <div className="segmented">
      {options.map(([v, label, note]) => (
        <label key={v} className={value === v ? "is-on" : ""}>
          <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} disabled={disabled} />
          <strong>{label}</strong>
          <span>{note}</span>
        </label>
      ))}
    </div>
  );
}

const elapsed = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

function useNow(active) {
  const [now, setNow] = useState(() => Date.now());
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
  const [mode, setMode] = useState("meeting");

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
          <Waveform stream={meeting.stream} segment={meeting.segment} price={config.prices.transcribe} idle={meeting.phase === "idle"} />
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
            <div>
              <dt>Mic</dt>
              <dd className={recording ? "is-rec" : ""}>
                {recording ? <><i className="rec-dot" />Đang mở</> : "Tắt"}
              </dd>
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
                <Segmented name="chunk" options={CHUNKS} value={chunkSeconds} onChange={setChunkSeconds} />
              </fieldset>

              <fieldset className="field">
                <legend>Loại phiên</legend>
                <Segmented name="mode" options={MODES} value={mode} onChange={setMode} />
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
                {chunks.filter((c) => c.status === "paid").length} đoạn đã trả tiền. Sửa lời thoại nếu AI nghe nhầm, rồi phân tích cả phiên
                và ghi receipt lên chain.
              </p>
              <fieldset className="field">
                <legend>Phân tích theo kiểu</legend>
                <Segmented name="mode-end" options={MODES} value={mode} onChange={setMode} disabled={meeting.phase === "summarizing"} />
              </fieldset>
              <button
                type="button"
                className="btn btn-primary btn-wide btn-tall"
                disabled={meeting.busy || meeting.phase === "summarizing"}
                onClick={() => meeting.finalize(mode)}
              >
                {meeting.phase === "summarizing"
                  ? "Đang phân tích và ghi receipt…"
                  : meeting.busy
                    ? "Chờ các đoạn đang xử lý…"
                    : `${mode === "interview" ? "Chấm điểm phỏng vấn" : "Tóm tắt cuộc họp"} và ghi receipt · ${config.prices.summary} USDC`}
              </button>
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
  return (
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
