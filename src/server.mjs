// TalkMeter seller: two paid routes (one minute of transcript, one meeting summary) and the on-chain receipt.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createPublicClient, createWalletClient, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { FACILITATOR_URL, NET, address, fromUnits, price, stop, toUnits, txLink } from "./networks.mjs";
import { RECEIPT_ABI, receiptHash, sessionKey, textHash } from "./receipt.mjs";

const PORT = Number(process.env.PORT || 4021);
const PAY_TO = address("PAY_TO");
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const PRICE_TRANSCRIBE = process.env.PRICE_TRANSCRIBE || "0.02";
const PRICE_SUMMARY = process.env.PRICE_SUMMARY || "0.05";
const PRICE_GAS = process.env.PRICE_USDC || "0.001";
const STT_PROMPT = process.env.STT_PROMPT || "Cuộc họp nhóm sinh viên Việt Nam bàn về dự án TalkMeter, phân công nhiệm vụ và thời hạn hoàn thành.";
const LLM_MODEL = process.env.LLM_MODEL || "openai/gpt-oss-120b";
const RECEIPT_CONTRACT = process.env.RECEIPT_CONTRACT || "";

const GROQ_BASE = "https://api.groq.com/openai/v1";

if (!GROQ_API_KEY) stop("Thiếu GROQ_API_KEY trong .env.local");
if (RECEIPT_CONTRACT && !isAddress(RECEIPT_CONTRACT)) stop("RECEIPT_CONTRACT không phải địa chỉ hợp lệ.");

// ---------- x402 ----------
const payments = new x402ResourceServer(new HTTPFacilitatorClient({ url: FACILITATOR_URL })).register(
  NET.id,
  new ExactEvmScheme()
);
try {
  await payments.initialize();
} catch {
  stop(`Không kết nối được facilitator tại ${FACILITATOR_URL}. Đổi FACILITATOR_URL hoặc chạy npm run facilitator.`);
}
if (!payments.getSupportedKind(2, NET.id, "exact")) stop(`Facilitator không hỗ trợ mạng ${NET.name}`);

payments.onAfterVerify(async ({ result }) => {
  if (!result.isValid) console.log(`[Từ chối thanh toán] ${result.invalidReason}`);
});
payments.onAfterSettle(async ({ result, requirements }) => {
  if (result.success) console.log(`[Đã thu ${fromUnits(requirements.amount)} USDC] ${txLink(result.transaction)}`);
  else console.log(`[Lỗi settle] ${result.errorReason}`);
});

const paid = (usdc, description) => ({
  accepts: [{ scheme: "exact", network: NET.id, payTo: PAY_TO, price: price(usdc) }],
  description,
  mimeType: "application/json",
});

// ---------- chain ----------
const chain = createPublicClient({ chain: NET.chain, transport: http(NET.rpc) });
const opKey = (process.env.OPERATOR_PRIVATE_KEY || "").replace(/^(?!0x)/, "0x");
const operator = /^0x[0-9a-fA-F]{64}$/.test(opKey)
  ? createWalletClient({
      account: privateKeyToAccount(opKey),
      chain: NET.chain,
      transport: http(NET.rpc),
    })
  : null;
const receiptsEnabled = Boolean(operator && RECEIPT_CONTRACT);
if (!receiptsEnabled) console.warn("Chưa có OPERATOR_PRIVATE_KEY hoặc RECEIPT_CONTRACT: tóm tắt vẫn chạy, nhưng không ghi receipt on-chain.");

// Receipts that failed to write after their summary was paid. Only these can be retried for free.
// shortcut: in-memory, lost on restart; fine for a single demo server.
const pendingReceipts = new Map();

async function writeReceipt({ sessionId, payer, chunks }) {
  const key = sessionKey(sessionId);
  const hash = receiptHash(sessionId, chunks);
  const existing = await chain.readContract({ address: RECEIPT_CONTRACT, abi: RECEIPT_ABI, functionName: "receiptOf", args: [key] });
  if (existing !== `0x${"0".repeat(64)}`) {
    if (existing.toLowerCase() !== hash.toLowerCase()) throw new Error("Phiên này đã có receipt khác trên chain.");
    return { receiptHash: hash, txHash: null, explorerUrl: null, alreadyLogged: true };
  }
  const paidUnits = BigInt(toUnits(PRICE_TRANSCRIBE)) * BigInt(chunks.length) + BigInt(toUnits(PRICE_SUMMARY));
  const txHash = await operator.writeContract({
    address: RECEIPT_CONTRACT,
    abi: RECEIPT_ABI,
    functionName: "log",
    args: [key, payer, hash, chunks.length, paidUnits],
  });
  await chain.waitForTransactionReceipt({ hash: txHash });
  return { receiptHash: hash, txHash, explorerUrl: txLink(txHash), paidUsdc: fromUnits(paidUnits) };
}

const HEX32 = /^0x[0-9a-fA-F]{64}$/;
function readReceiptInput(body) {
  const { sessionId, payer, chunks } = body || {};
  if (typeof sessionId !== "string" || sessionId.length < 4 || sessionId.length > 100) return null;
  if (!isAddress(payer || "")) return null;
  if (!Array.isArray(chunks) || chunks.length > 2000) return null;
  const clean = chunks
    .filter((c) => Number.isInteger(c?.index) && HEX32.test(c?.transcriptHash) && HEX32.test(c?.txHash))
    .map(({ index, transcriptHash, txHash }) => ({ index, transcriptHash, txHash }));
  return { sessionId, payer, chunks: clean };
}

// ---------- app ----------
const app = express();
app.use("/api/transcribe", express.raw({ type: "audio/*", limit: "10mb" }));
app.use("/api", express.json({ limit: "2mb" }));

app.use(
  paymentMiddleware(
    {
      "GET /api/gas": paid(PRICE_GAS, "Kiểm tra gas Fuji"),
      "POST /api/transcribe": paid(PRICE_TRANSCRIBE, "Một đoạn transcript"),
      "POST /api/summary": paid(PRICE_SUMMARY, "Tóm tắt và action items của cả phiên"),
    },
    payments
  )
);

// Free: what the browser needs to know before it pays anything.
app.get("/api/config", (req, res) => {
  res.json({
    network: { key: NET.key, name: NET.name, id: NET.id, chainId: NET.chain.id, usdc: NET.usdc, explorer: NET.explorer },
    prices: { transcribe: PRICE_TRANSCRIBE, summary: PRICE_SUMMARY },
    payTo: PAY_TO,
    receiptContract: receiptsEnabled ? RECEIPT_CONTRACT : null,
  });
});

app.get("/api/gas", async (req, res) => {
  try {
    const block = await chain.getBlock();
    res.json({ network: NET.name, block: Number(block.number), baseFeeWei: String(block.baseFeePerGas ?? 0) });
  } catch {
    res.status(502).json({ error: `Không đọc được mạng ${NET.name}` });
  }
});

app.post("/api/transcribe", async (req, res) => {
  try {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: "Thiếu dữ liệu âm thanh. Bạn không bị trừ tiền." });
    }
    const contentType = req.headers["content-type"] || "audio/webm";
    const ext = contentType.includes("wav") ? "wav" : contentType.includes("mp4") ? "mp4" : contentType.includes("ogg") ? "ogg" : "webm";

    console.log(`[STT] Nhận chunk: ${req.body.length} bytes, type: ${contentType}`);
    if (req.body.length < 3000) {
      return res.json({ text: "", transcriptHash: textHash("") });
    }

    const cleanMime = contentType.replace(/;.*$/, "").trim();
    const form = new FormData();
    form.append("file", new Blob([req.body], { type: cleanMime }), `chunk.${ext}`);
    form.append("model", "whisper-large-v3");
    form.append("language", "vi");
    form.append("temperature", "0");
    form.append("response_format", "json");



    const r = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: form,
    });
    if (!r.ok) {
      console.error("[Lỗi Groq STT]", r.status, await r.text());
      return res.status(502).json({ error: r.status === 429 ? "STT đang quá tải (429). Bạn không bị trừ tiền." : "STT lỗi. Bạn không bị trừ tiền." });
    }
    const text = ((await r.json()).text || "").trim();
    // The audio is not stored: received, sent to STT, dropped.
    res.json({ text, transcriptHash: textHash(text) });
  } catch (err) {
    console.error("[Lỗi /api/transcribe]", err);
    res.status(500).json({ error: "Lỗi server. Bạn không bị trừ tiền." });
  }
});

app.post("/api/summary", async (req, res) => {
  const { transcript, mode = "meeting" } = req.body || {};
  if (typeof transcript !== "string" || transcript.trim().length < 5) {
    return res.status(400).json({ error: "Transcript quá ngắn để tóm tắt. Bạn không bị trừ tiền." });
  }
  const receiptInput = readReceiptInput(req.body);
  if (receiptsEnabled && !receiptInput) {
    return res.status(400).json({ error: "Thiếu sessionId, ví hoặc danh sách giao dịch. Bạn không bị trừ tiền." });
  }

  try {
    const tz = "Asia/Ho_Chi_Minh";
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: tz });
    const weekday = new Date().toLocaleDateString("vi-VN", { weekday: "long", timeZone: tz });

    const isInterview = mode === "interview";
    const system = isInterview
      ? [
          "Bạn là Trợ lý Phỏng vấn (Interviewer Copilot) công bằng của TalkMeter. Chỉ trả về JSON hợp lệ, không bọc markdown.",
          "Đứng về phía nhà tuyển dụng để đánh giá khách quan, KHÔNG mớm câu trả lời cho ứng viên.",
          "Phân tích transcript cuộc phỏng vấn để: (1) tóm tắt năng lực ứng viên, (2) cảnh báo câu hỏi có nguy cơ thiên vị (tuổi tác, giới tính, vùng miền, đời tư) hoặc điểm cần lưu ý vào mảng decisions, (3) chấm điểm từng tiêu chí vào action_items với cấu trúc: task = Tên tiêu chí + Nhận xét ngắn, owner = Điểm số (ví dụ '8/10'), deadline = Gợi ý câu hỏi đào sâu tiếp theo, quote = Câu nói dẫn chứng trong transcript.",
          'Khuôn JSON bắt buộc: {"summary":"3-5 câu đánh giá tổng quan ứng viên","decisions":["Cảnh báo thiên vị / Điểm lưu ý..."],"action_items":[{"task":"Tiêu chí: ...","owner":"8/10","deadline":"Câu hỏi đào sâu: ...","quote":"..."}]}',
        ].join("\n")
      : [
          "Bạn là thư ký cuộc họp của TalkMeter. Chỉ trả về một đối tượng JSON hợp lệ, không bọc markdown.",
          `Hôm nay là ${weekday}, ngày ${today}.`,
          "Chỉ dùng thông tin có trong transcript. Không đoán.",
          "action_items: owner là tên người được giao việc, không rõ thì null. deadline đổi mốc tương đối ('thứ Sáu tuần này', 'ngày mai') thành YYYY-MM-DD theo ngày hôm nay, không có thì null. quote là câu gốc trong transcript.",
          'Khuôn bắt buộc: {"summary":"3-5 câu, cùng ngôn ngữ với cuộc họp","decisions":["..."],"action_items":[{"task":"...","owner":null,"deadline":null,"quote":"..."}]}',
        ].join("\n");

    const r = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: transcript },
        ],
      }),
    });
    if (!r.ok) {
      console.error("[Lỗi Groq LLM]", r.status, await r.text());
      return res.status(502).json({ error: "AI tóm tắt lỗi. Bạn không bị trừ tiền." });
    }
    let result;
    try {
      result = JSON.parse((await r.json()).choices?.[0]?.message?.content || "");
    } catch {
      return res.status(502).json({ error: "AI trả về sai định dạng. Bạn không bị trừ tiền." });
    }
    const summary = {
      mode: isInterview ? "interview" : "meeting",
      summary: String(result.summary || ""),
      decisions: Array.isArray(result.decisions) ? result.decisions.map(String) : [],
      action_items: Array.isArray(result.action_items) ? result.action_items : [],
    };

    let receipt = null;
    let receiptError = null;
    if (receiptsEnabled) {
      try {
        receipt = await writeReceipt(receiptInput);
      } catch (err) {
        console.error("[Lỗi ghi receipt]", err);
        pendingReceipts.set(receiptInput.sessionId, receiptInput);
        receiptError = "Chưa ghi được receipt on-chain. Bấm thử lại, không mất thêm phí.";
      }
    } else {
      receiptError = "Server chưa cấu hình ReceiptLog (OPERATOR_PRIVATE_KEY, RECEIPT_CONTRACT).";
    }
    res.json({ ...summary, receipt, receiptError });
  } catch (err) {
    console.error("[Lỗi /api/summary]", err);
    res.status(500).json({ error: "Lỗi server. Bạn không bị trừ tiền." });
  }
});

app.post("/api/receipt/retry", async (req, res) => {
  const input = pendingReceipts.get(req.body?.sessionId);
  if (!input) return res.status(404).json({ error: "Không có receipt nào đang chờ cho phiên này." });
  try {
    const receipt = await writeReceipt(input);
    pendingReceipts.delete(input.sessionId);
    res.json({ receipt });
  } catch (err) {
    console.error("[Lỗi thử lại receipt]", err);
    res.status(502).json({ error: "Vẫn chưa ghi được receipt. Kiểm tra AVAX của ví operator." });
  }
});

app.use("/api", (req, res) => res.status(404).json({ error: "Không có route này." }));

// The built web app, served from the same origin so payment headers need no CORS.
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => (req.method === "GET" ? res.sendFile(path.join(dist, "index.html")) : next()));
}

app.listen(PORT, () => {
  console.log(`TalkMeter chạy tại http://localhost:${PORT} trên ${NET.name}`);
  console.log(fs.existsSync(dist) ? "Đang phục vụ giao diện từ client/dist." : "Chưa có client/dist: chạy npm run build, hoặc npm run client cho bản dev.");
});
