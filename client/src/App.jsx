import { useState, useEffect, useRef } from "react";
import {
  getSessionWallet,
  resetSessionWallet,
  getUsdcBalance,
  createPayingFetch,
} from "./x402Client";

const PRICE_PER_CHUNK = 0.02;
const PRICE_SUMMARY = 0.05;

export default function App() {
  const [wallet, setWallet] = useState(() => getSessionWallet());
  const [balance, setBalance] = useState(0);
  const [budgetCap, setBudgetCap] = useState(0.1);
  const [spent, setSpent] = useState(0);
  const [consentChecked, setConsentChecked] = useState(false);
  const [chunkSeconds, setChunkSeconds] = useState(60);

  const [isRecording, setIsRecording] = useState(false);
  const [statusMsg, setStatusMsg] = useState("Sẵn sàng bắt đầu phiên họp.");
  const [chunksLog, setChunksLog] = useState([]);
  const [summaryData, setSummaryData] = useState(null);
  const [receiptData, setReceiptData] = useState(null);
  const [isSummarizing, setIsSummarizing] = useState(false);

  const sessionIdRef = useRef(`tm-${Date.now()}`);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const timerRef = useRef(null);
  const runningRef = useRef(false);
  const spentRef = useRef(0);
  const chunkIndexRef = useRef(0);

  const refreshBalance = async (addr = wallet.address) => {
    try {
      const bal = await getUsdcBalance(addr);
      setBalance(bal);
    } catch (e) {
      console.error("Lỗi đọc số dư:", e);
    }
  };

  useEffect(() => {
    refreshBalance();
    const id = setInterval(() => refreshBalance(), 8000);
    return () => clearInterval(id);
  }, [wallet.address]);

  const processAudioChunk = async (blob, idx) => {
    const audioUrl = URL.createObjectURL(blob);
    setStatusMsg(`⏳ Đang thanh toán 0.02 USDC & chuyển giọng nói đoạn #${idx + 1}...`);

    try {
      const callPaidApi = createPayingFetch(wallet.account);
      const { data, txHash } = await callPaidApi("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "audio/webm" },
        body: blob,
      });

      spentRef.current = Number((spentRef.current + PRICE_PER_CHUNK).toFixed(4));
      setSpent(spentRef.current);

      setChunksLog((prev) => [
        ...prev,
        {
          index: idx + 1,
          text: data.text || "(Không có lời thoại)",
          transcriptHash: data.transcriptHash,
          txHash: txHash || "0x0000000000000000000000000000000000000000000000000000000000000000",
          audioUrl,
        },
      ]);

      setStatusMsg(`✅ Đã ghi nhận đoạn #${idx + 1} (0.02 USDC).`);
      refreshBalance();
    } catch (err) {
      setStatusMsg(`⚠️ Lỗi đoạn #${idx + 1}: ${err.message} (Không trừ tiền).`);
    }
  };

  const startNextSegment = () => {
    if (!runningRef.current || !streamRef.current) return;

    if (spentRef.current + PRICE_PER_CHUNK > Number(budgetCap)) {
      stopMeeting("🛑 Đã chạm trần ngân sách phiên! Mic tự động tắt.");
      return;
    }

    const recorder = new MediaRecorder(streamRef.current, {
      mimeType: "audio/webm;codecs=opus",
    });
    const parts = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) parts.push(e.data);
    };

    recorder.onstop = () => {
      const idx = chunkIndexRef.current++;
      const blob = new Blob(parts, { type: "audio/webm" });
      if (blob.size > 0) {
        processAudioChunk(blob, idx);
      }
      if (runningRef.current) {
        if (spentRef.current + PRICE_PER_CHUNK > Number(budgetCap)) {
          stopMeeting("🛑 Đã chạm trần ngân sách phiên! Mic tự động tắt.");
        } else {
          startNextSegment();
        }
      }
    };

    recorderRef.current = recorder;
    recorder.start();

    timerRef.current = setTimeout(() => {
      if (recorder.state === "recording") {
        recorder.stop();
      }
    }, chunkSeconds * 1000);
  };

  const startMeeting = async () => {
    if (!consentChecked) {
      alert("Vui lòng tích vào ô đồng ý ghi âm.");
      return;
    }
    if (Number(budgetCap) < PRICE_PER_CHUNK) {
      alert("Trần ngân sách phải tối thiểu 0.02 USDC.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      runningRef.current = true;
      setIsRecording(true);
      setStatusMsg(`🎙️ Đang ghi âm (cắt mỗi ${chunkSeconds}s - 0.02 USDC/đoạn)...`);
      startNextSegment();
    } catch (err) {
      alert("Không thể truy cập Micro: " + err.message);
    }
  };

  const stopMeeting = (customMsg = "⏹️ Đã dừng ghi âm.") => {
    runningRef.current = false;
    setIsRecording(false);
    clearTimeout(timerRef.current);

    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStatusMsg(customMsg);
  };

  const finalizeMeeting = async () => {
    if (chunksLog.length === 0) {
      alert("Chưa có dữ liệu lời thoại nào để tóm tắt.");
      return;
    }

    setIsSummarizing(true);
    setStatusMsg("⏳ Đang thanh toán 0.05 USDC để AI tóm tắt & trích xuất Action Items...");

    try {
      const fullTranscript = chunksLog.map((c) => `[Đoạn ${c.index}]: ${c.text}`).join("\n");
      const callPaidApi = createPayingFetch(wallet.account);

      const { data: sumRes } = await callPaidApi("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: fullTranscript }),
      });

      setSummaryData(sumRes);
      const totalPaid = Number((spentRef.current + PRICE_SUMMARY).toFixed(4));
      setSpent(totalPaid);

      setStatusMsg("⛓️ Đang ghi mã băm biên lai (Receipt Hash) lên Avalanche Fuji...");
      const receiptRes = await fetch("/api/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          payer: wallet.address,
          chunks: chunksLog.map((c) => ({
            transcriptHash: c.transcriptHash,
            txHash: c.txHash,
          })),
          paidUsdc: Math.round(totalPaid * 1_000_000),
        }),
      });

      const receiptJson = await receiptRes.json();
      if (!receiptRes.ok) throw new Error(receiptJson.error);

      setReceiptData(receiptJson);
      setStatusMsg("🎉 Hoàn tất phiên họp! Biên lai đã lưu bất biến trên Avalanche Fuji.");
      refreshBalance();
    } catch (err) {
      setStatusMsg(`❌ Lỗi khi tổng kết phiên: ${err.message}`);
    } finally {
      setIsSummarizing(false);
    }
  };

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #ddd", paddingBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, color: "#E84142" }}>TalkMeter</h1>
          <small>AI Meeting Copilot · Pay-as-you-go qua x402 trên Avalanche Fuji</small>
        </div>
        <div style={{ textAlign: "right", fontSize: 13 }}>
          <div><strong>Ví phiên:</strong> {wallet.address.slice(0, 8)}...{wallet.address.slice(-6)}</div>
          <div><strong>Số dư USDC:</strong> <span style={{ color: "#16a34a", fontWeight: "bold" }}>{balance.toFixed(4)} USDC</span></div>
          <button
            onClick={() => { navigator.clipboard.writeText(wallet.address); alert("Đã copy địa chỉ ví phiên!"); }}
            style={{ marginRight: 6, fontSize: 11, cursor: "pointer" }}
          >
            Copy ví nạp USDC
          </button>
          <button
            onClick={() => { setWallet(resetSessionWallet()); setChunksLog([]); setSpent(0); spentRef.current = 0; }}
            style={{ fontSize: 11, cursor: "pointer" }}
          >
            Tạo ví mới
          </button>
        </div>
      </header>

      <section style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: 16, borderRadius: 8, marginTop: 16 }}>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={consentChecked}
            onChange={(e) => setConsentChecked(e.target.checked)}
            disabled={isRecording}
            style={{ marginTop: 4 }}
          />
          <span style={{ fontSize: 14 }}>
            <strong>Thông báo quyền riêng tư & Đồng ý ghi âm:</strong> Tôi xác nhận đã thông báo và nhận được sự đồng ý của tất cả thành viên tham gia cuộc họp về việc thu âm và xử lý bằng AI. Chỉ mã băm (hash) biên lai được lưu on-chain, nội dung cuộc họp không lưu trên blockchain.
          </span>
        </label>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 16, background: "#f8fafc", padding: 16, borderRadius: 8 }}>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: "bold" }}>Trần ngân sách (USDC)</label>
          <input
            type="number"
            step="0.02"
            min="0.02"
            value={budgetCap}
            onChange={(e) => setBudgetCap(e.target.value)}
            disabled={isRecording}
            style={{ width: "90%", padding: 6, marginTop: 4 }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: "bold" }}>Chu kỳ cắt đoạn</label>
          <select
            value={chunkSeconds}
            onChange={(e) => setChunkSeconds(Number(e.target.value))}
            disabled={isRecording}
            style={{ width: "95%", padding: 6, marginTop: 4 }}
          >
            <option value={60}>60 giây (Chuẩn thực tế)</option>
            <option value={15}>15 giây (Chế độ quay Demo nhanh)</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: "bold" }}>Đã chi tiêu phiên này</div>
          <div style={{ fontSize: 20, fontWeight: "bold", color: spent >= budgetCap ? "#dc2626" : "#0f172a", marginTop: 4 }}>
            {spent.toFixed(2)} / {Number(budgetCap).toFixed(2)} USDC
          </div>
        </div>
      </section>

      <div style={{ display: "flex", gap: 12, marginTop: 16, alignItems: "center" }}>
        {!isRecording ? (
          <button
            onClick={startMeeting}
            disabled={!consentChecked}
            style={{ padding: "10px 20px", background: consentChecked ? "#E84142" : "#94a3b8", color: "#fff", border: "none", borderRadius: 6, fontWeight: "bold", cursor: consentChecked ? "pointer" : "not-allowed" }}
          >
            🎙️ Bắt đầu họp (0.02 USDC/đoạn)
          </button>
        ) : (
          <button
            onClick={() => stopMeeting()}
            style={{ padding: "10px 20px", background: "#1e293b", color: "#fff", border: "none", borderRadius: 6, fontWeight: "bold", cursor: "pointer" }}
          >
            ⏹️ Dừng ghi âm
          </button>
        )}

        <button
          onClick={finalizeMeeting}
          disabled={isRecording || chunksLog.length === 0 || isSummarizing}
          style={{ padding: "10px 20px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, fontWeight: "bold", cursor: "pointer" }}
        >
          {isSummarizing ? "⏳ Đang xử lý..." : "✨ Tóm tắt & Lưu Biên lai (0.05 USDC)"}
        </button>

        {isRecording && <span style={{ color: "#dc2626", fontWeight: "bold" }}>● ĐANG GHI ÂM</span>}
      </div>

      <div style={{ marginTop: 12, padding: 10, background: "#f1f5f9", borderRadius: 6, fontSize: 14 }}>
        <strong>Trạng thái:</strong> {statusMsg}
      </div>

      <section style={{ marginTop: 24 }}>
        <h3>📝 Lời thoại trực tiếp (Transcript)</h3>
        {chunksLog.length === 0 && <p style={{ color: "#64748b" }}>Chưa có đoạn ghi âm nào. Bấm "Bắt đầu họp" để thu âm.</p>}
        {chunksLog.map((c) => (
          <div key={c.index} style={{ border: "1px solid #e2e8f0", padding: 12, borderRadius: 8, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b", marginBottom: 6 }}>
              <span><strong>Đoạn #{c.index}</strong> · Đã trả 0.02 USDC</span>
              <div>
                <audio controls src={c.audioUrl} style={{ height: 24, verticalAlign: "middle", marginRight: 8 }} />
                {c.txHash && !c.txHash.startsWith("0x0000") && (
                  <a href={`https://snowtrace.io{c.txHash}`} target="_blank" rel="noreferrer">
                    Xem Tx trên Snowtrace ↗
                  </a>
                )}
              </div>
            </div>
            <div style={{ fontSize: 15 }}>{c.text}</div>
          </div>
        ))}
      </section>

      {summaryData && (
        <section style={{ marginTop: 24, padding: 20, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8 }}>
          <h3 style={{ marginTop: 0 }}>📊 Tóm tắt cuộc họp & Action Items</h3>
          <p><strong>Tóm tắt:</strong> {summaryData.summary}</p>

          {summaryData.decisions?.length > 0 && (
            <>
              <strong>Quyết định đã chốt:</strong>
              <ul>
                {summaryData.decisions.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </>
          )}

          <strong>Danh sách việc cần làm (Action Items):</strong>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8, background: "#fff" }}>
            <thead>
              <tr style={{ background: "#dcfce7", textAlign: "left" }}>
                <th style={{ padding: 8, border: "1px solid #cbd5e1" }}>Công việc</th>
                <th style={{ padding: 8, border: "1px solid #cbd5e1" }}>Người phụ trách</th>
                <th style={{ padding: 8, border: "1px solid #cbd5e1" }}>Hạn chót</th>
                <th style={{ padding: 8, border: "1px solid #cbd5e1" }}>Trích dẫn gốc</th>
              </tr>
            </thead>
            <tbody>
              {summaryData.action_items?.map((item, idx) => (
                <tr key={idx}>
                  <td style={{ padding: 8, border: "1px solid #cbd5e1" }}>{item.task}</td>
                  <td style={{ padding: 8, border: "1px solid #cbd5e1" }}>{item.owner || "Chưa rõ"}</td>
                  <td style={{ padding: 8, border: "1px solid #cbd5e1" }}>{item.deadline || "Chưa rõ"}</td>
                  <td style={{ padding: 8, border: "1px solid #cbd5e1", fontStyle: "italic", fontSize: 13 }}>"{item.quote}"</td>
                </tr>
              ))}
            </tbody>
          </table>

          {receiptData && (
            <div style={{ marginTop: 16, padding: 12, background: "#ecfdf5", border: "1px solid #10b981", borderRadius: 6 }}>
              <strong>⛓️ Biên lai On-chain (Avalanche Fuji):</strong><br />
              <code style={{ fontSize: 12 }}>Receipt Hash: {receiptData.receiptHash}</code><br />
              <a href={receiptData.explorerUrl} target="_blank" rel="noreferrer" style={{ fontWeight: "bold", color: "#047857" }}>
                Kiểm chứng giao dịch trên Snowtrace ↗
              </a>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
