// One meeting: mic -> self-contained audio chunks -> one x402 payment per chunk -> live transcript,
// stopped automatically before the budget cap, then one paid summary that also writes the on-chain receipt.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPaidCaller, publicClientFor } from "../lib/x402Client";
import { RECEIPT_OF_ABI, receiptHash, sessionKey, textHash } from "../lib/receipt";
import { toMicro } from "../lib/money";

const MIN_CHUNK_MS = 2000; // a stop pressed right after a chunk starts would otherwise bill a second of silence
const NO_RETRY = /không đủ USDC|hạn mức/;

function pickMime() {
  if (typeof MediaRecorder === "undefined") return "";
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

export function useMeeting({ config, wallet, onPaid }) {
  const [phase, setPhase] = useState("idle"); // idle | recording | stopped | summarizing | done
  const [chunks, setChunks] = useState([]);
  const [committed, setCommitted] = useState(0); // micro-USDC reserved or paid
  const [segment, setSegment] = useState(null); // { index, startedAt } of the chunk being recorded
  const [startedAt, setStartedAt] = useState(null);
  const [stream, setStream] = useState(null);
  const [notice, setNotice] = useState(null); // { tone: info|warn|error|cap|ok, text }
  const [result, setResult] = useState(null); // summary, decisions, action_items, summaryTx
  const [receipt, setReceipt] = useState(null);
  const [receiptError, setReceiptError] = useState(null);
  const [verification, setVerification] = useState(null);
  const [session, setSession] = useState({ id: null, budget: 0, chunkMs: 0 });

  const priceMicro = config ? toMicro(config.prices.transcribe) : 0;
  const summaryMicro = config ? toMicro(config.prices.summary) : 0;

  const r = useRef({}).current; // mutable session state that recorder callbacks read
  const setCommittedBy = (delta) => {
    r.committed = (r.committed || 0) + delta;
    setCommitted(r.committed);
  };
  const update = (index, patch) => setChunks((list) => list.map((c) => (c.index === index ? { ...c, ...patch } : c)));
  const fits = () => r.committed + priceMicro + summaryMicro <= r.budget;

  const releaseStream = () => {
    r.stream?.getTracks().forEach((t) => t.stop());
    r.stream = null;
    setStream(null);
    setSegment(null);
  };

  const halt = useCallback((tone, text) => {
    r.running = false;
    clearTimeout(r.timer);
    if (r.recorder?.state === "recording") r.recorder.stop(); // onstop bills the last chunk, then releases the mic
    else releaseStream();
    setPhase("stopped");
    setNotice({ tone, text });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (index, blob, attempt) => {
    try {
      const { data, txHash } = await r.call("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": blob.type || "audio/webm" },
        body: blob,
      });
      update(index, {
        status: txHash ? "paid" : "unconfirmed",
        text: data.text || "",
        transcriptHash: data.transcriptHash,
        txHash,
        error: null,
      });
      onPaid?.();
    } catch (err) {
      if (attempt < 1 && !NO_RETRY.test(err.message)) return send(index, blob, attempt + 1); // fresh signature
      setCommittedBy(-priceMicro);
      update(index, { status: "failed", error: err.message });
      if (/không đủ USDC/.test(err.message) && r.running) halt("error", "Ví phiên hết USDC nên mic đã tắt. Nạp thêm rồi bắt đầu phiên mới.");
    }
  };

  const startSegment = () => {
    if (!r.running || !r.stream) return;
    if (!fits()) {
      halt("cap", "Đã chạm trần ngân sách. Mic tự tắt và không phát sinh thêm giao dịch nào. Phần còn lại dành cho bản tóm tắt.");
      return;
    }
    setCommittedBy(priceMicro); // reserve before recording, so chunks in flight can never push spend past the cap
    const index = ++r.lastIndex;
    const mime = pickMime();
    const recorder = new MediaRecorder(r.stream, mime ? { mimeType: mime } : undefined);
    const parts = [];
    const begin = Date.now();
    recorder.ondataavailable = (e) => e.data?.size && parts.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(parts, { type: recorder.mimeType || mime || "audio/webm" });
      const durationMs = Date.now() - begin;
      if (durationMs < MIN_CHUNK_MS || blob.size === 0) {
        setCommittedBy(-priceMicro);
      } else {
        r.blobs.set(index, blob);
        setChunks((list) => [...list, { index, status: "paying", durationMs, audioUrl: URL.createObjectURL(blob), text: "" }]);
        send(index, blob, 0);
      }
      if (r.running) startSegment();
      else releaseStream();
    };
    r.recorder = recorder;
    recorder.start();
    setSegment({ index, startedAt: begin });
    r.timer = setTimeout(() => recorder.state === "recording" && recorder.stop(), r.chunkMs);
  };

  const start = async ({ budgetUsdc, chunkSeconds }) => {
    if (!config || !wallet) return;
    const budget = toMicro(budgetUsdc);
    if (budget < priceMicro + summaryMicro) {
      setNotice({ tone: "warn", text: `Trần ngân sách phải đủ cho ít nhất một đoạn và bản tóm tắt: ${(priceMicro + summaryMicro) / 1e6} USDC.` });
      return;
    }
    let micStream;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      setNotice({ tone: "error", text: `Không mở được micro (${err.name}). Cho phép quyền micro trong trình duyệt và dùng HTTPS hoặc localhost.` });
      return;
    }
    chunks.forEach((c) => URL.revokeObjectURL(c.audioUrl));
    Object.assign(r, {
      running: true,
      stream: micStream,
      budget,
      chunkMs: chunkSeconds * 1000,
      committed: 0,
      lastIndex: 0,
      blobs: new Map(),
      sessionId: `tm-${crypto.randomUUID()}`,
      call: createPaidCaller(wallet.account, config.network, Math.max(priceMicro, summaryMicro)),
    });
    setSession({ id: r.sessionId, budget, chunkMs: chunkSeconds * 1000 });
    setCommitted(0);
    setChunks([]);
    setResult(null);
    setReceipt(null);
    setReceiptError(null);
    setVerification(null);
    setStream(micStream);
    setStartedAt(Date.now());
    setPhase("recording");
    setNotice({ tone: "info", text: `Đang ghi. Cứ ${chunkSeconds} giây là một đoạn, mỗi đoạn trả ${config.prices.transcribe} USDC.` });
    startSegment();
  };

  const stop = () => halt("info", "Đã dừng ghi. Đoạn cuối vẫn được tính nếu dài hơn 2 giây.");

  const retry = (index) => {
    const blob = r.blobs?.get(index);
    if (!blob) return;
    if (!fits()) {
      setNotice({ tone: "warn", text: "Không còn đủ ngân sách để thử lại đoạn này mà vẫn giữ phần cho bản tóm tắt." });
      return;
    }
    setCommittedBy(priceMicro);
    update(index, { status: "paying", error: null });
    send(index, blob, 1);
  };

  const ordered = useMemo(() => [...chunks].sort((a, b) => a.index - b.index), [chunks]);
  const paidChunks = ordered.filter((c) => c.status === "paid");
  const busy = ordered.some((c) => c.status === "paying");

  const finalize = async (mode = "meeting") => {
    const said = (c) => c.edited ?? c.text; // corrections feed the summary; the receipt keeps the paid STT text
    const spoken = ordered.filter((c) => (c.status === "paid" || c.status === "unconfirmed") && said(c).trim());
    if (!spoken.length) {
      setNotice({ tone: "warn", text: "Chưa có lời thoại nào để tóm tắt. Bạn không bị trừ tiền." });
      return;
    }
    setPhase("summarizing");
    setNotice({ tone: "info", text: `Đang trả ${config.prices.summary} USDC cho bản tóm tắt và ghi receipt lên ${config.network.name}.` });
    try {
      const { data, txHash } = await r.call("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          transcript: spoken.map((c) => `[Đoạn ${c.index}] ${said(c)}`).join("\n"),
          sessionId: r.sessionId,
          payer: wallet.address,
          chunks: paidChunks.map(({ index, transcriptHash, txHash }) => ({ index, transcriptHash, txHash })),
        }),
      });
      setCommittedBy(summaryMicro);
      setResult({ mode: data.mode || mode, summary: data.summary, decisions: data.decisions || [], action_items: data.action_items || [], summaryTx: txHash });
      setReceipt(data.receipt);
      setReceiptError(data.receiptError);
      setPhase("done");
      setNotice(
        data.receipt
          ? { tone: "ok", text: "Xong phiên. Receipt đã nằm trên chain, bấm Kiểm chứng để tự tính lại." }
          : { tone: "warn", text: data.receiptError }
      );
      onPaid?.();
    } catch (err) {
      setPhase("stopped");
      setNotice({ tone: "error", text: err.message });
    }
  };

  const retryReceipt = async () => {
    const res = await fetch("/api/receipt/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: r.sessionId }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setReceipt(data.receipt);
      setReceiptError(null);
      setNotice({ tone: "ok", text: "Đã ghi receipt lên chain." });
    } else setReceiptError(data.error || "Chưa ghi được receipt.");
  };

  // Recompute the receipt from what is on screen and compare it with ReceiptLog, trusting no server.
  const verify = async () => {
    setVerification({ state: "checking" });
    try {
      const local = receiptHash(
        r.sessionId,
        paidChunks.map((c) => ({ index: c.index, transcriptHash: textHash(c.text), txHash: c.txHash }))
      );
      const onChain = await publicClientFor(config.network).readContract({
        address: config.receiptContract,
        abi: RECEIPT_OF_ABI,
        functionName: "receiptOf",
        args: [sessionKey(r.sessionId)],
      });
      setVerification({ state: local.toLowerCase() === onChain.toLowerCase() ? "match" : "mismatch", local, onChain });
    } catch (err) {
      setVerification({ state: "error", error: String(err.message || err) });
    }
  };

  const exportReceipt = () => {
    const file = {
      sessionId: r.sessionId,
      network: config.network.name,
      contract: config.receiptContract,
      payer: wallet.address,
      receiptHash: receipt?.receiptHash,
      receiptTx: receipt?.txHash,
      chunks: paidChunks.map(({ index, text, edited, transcriptHash, txHash }) => ({ index, text, edited, transcriptHash, txHash })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `talkmeter-receipt-${r.sessionId}.json` });
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    chunks.forEach((c) => URL.revokeObjectURL(c.audioUrl));
    r.committed = 0;
    setCommitted(0);
    setChunks([]);
    setResult(null);
    setReceipt(null);
    setReceiptError(null);
    setVerification(null);
    setStartedAt(null);
    setPhase("idle");
    setNotice(null);
  };

  useEffect(() => () => {
    r.running = false;
    clearTimeout(r.timer);
    r.stream?.getTracks().forEach((t) => t.stop());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The paid STT text stays untouched, so the on-chain receipt still verifies after a correction.
  const editChunk = (index, edited) => update(index, { edited });

  return {
    phase,
    chunks: ordered,
    busy,
    committed,
    paid: paidChunks.length * priceMicro + (result ? summaryMicro : 0),
    priceMicro,
    summaryMicro,
    budget: session.budget,
    chunkMs: session.chunkMs,
    segment,
    startedAt,
    stream,
    notice,
    result,
    receipt,
    receiptError,
    verification,
    sessionId: session.id,
    start,
    stop,
    retry,
    editChunk,
    finalize,
    retryReceipt,
    verify,
    exportReceipt,
    reset,
  };
}
