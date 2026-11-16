import express from "express";
import { createPublicClient, createWalletClient, http, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { FACILITATOR_URL, NET, address, fromUnits, price, stop, txLink } from "./networks.mjs";

const PORT = Number(process.env.PORT || 4021);
const PAY_TO = address("PAY_TO");
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

const PRICE_GAS = process.env.PRICE_USDC || "0.001";
const PRICE_TRANSCRIBE = process.env.PRICE_TRANSCRIBE || "0.02";
const PRICE_SUMMARY = process.env.PRICE_SUMMARY || "0.05";

const GROQ_HOST = ["api", "groq", "com"].join(".");
const GROQ_BASE = `https://${GROQ_HOST}/openai/v1`;
const STT_URL = `${GROQ_BASE}/audio/transcriptions`;
const LLM_URL = `${GROQ_BASE}/chat/completions`;

if (!GROQ_API_KEY) {
  stop("Thieu GROQ_API_KEY trong file .env.local");
}

const payments = new x402ResourceServer(
  new HTTPFacilitatorClient({ url: FACILITATOR_URL })
).register(NET.id, new ExactEvmScheme());

try {
  await payments.initialize();
} catch {
  stop(`Khong ket noi duoc Facilitator tai ${FACILITATOR_URL}`);
}
if (!payments.getSupportedKind(2, NET.id, "exact")) {
  stop(`Facilitator khong ho tro mang ${NET.name}`);
}

payments.onAfterVerify(async ({ result }) => {
  if (!result.isValid) console.log(`[Tu choi thanh toan] ${result.invalidReason}`);
});

payments.onAfterSettle(async ({ result, requirements }) => {
  if (result.success) {
    console.log(`[Da thu ${fromUnits(requirements.amount)} USDC] ${txLink(result.transaction)}`);
  } else {
    console.log(`[Loi settle] ${result.errorReason}`);
  }
});

const app = express();
app.use("/api/transcribe", express.raw({ type: "audio/*", limit: "10mb" }));
app.use("/api/summary", express.json({ limit: "2mb" }));

app.use(
  paymentMiddleware(
    {
      "GET /api/gas": {
        accepts: [{ scheme: "exact", network: NET.id, payTo: PAY_TO, price: price(PRICE_GAS) }],
        description: "Kiem tra gas Fuji",
        mimeType: "application/json",
      },
      "POST /api/transcribe": {
        accepts: [{ scheme: "exact", network: NET.id, payTo: PAY_TO, price: price(PRICE_TRANSCRIBE) }],
        description: "Chuyen giong noi thanh van ban",
        mimeType: "application/json",
      },
      "POST /api/summary": {
        accepts: [{ scheme: "exact", network: NET.id, payTo: PAY_TO, price: price(PRICE_SUMMARY) }],
        description: "Tom tat cuoc hop JSON",
        mimeType: "application/json",
      },
    },
    payments
  )
);
app.get("/", (req, res) => {
  res.json({
    name: "TalkMeter API",
    network: NET.name,
    paid: {
      "POST /api/transcribe": `${PRICE_TRANSCRIBE} USDC`,
      "POST /api/summary": `${PRICE_SUMMARY} USDC`,
    },
  });
});

const chain = createPublicClient({ chain: NET.chain, transport: http(NET.rpc) });
app.get("/api/gas", async (req, res) => {
  try {
    const block = await chain.getBlock();
    res.json({ network: NET.name, block: Number(block.number) });
  } catch {
    res.status(502).json({ error: "Loi doc mang Fuji" });
  }
});

app.post("/api/transcribe", async (req, res) => {
  try {
    if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: "Thieu du lieu am thanh" });
    }
    const contentType = req.headers["content-type"] || "audio/webm";
    const ext = contentType.includes("wav") ? "wav" : contentType.includes("mp4") ? "mp4" : "webm";

    const form = new FormData();
    form.append("file", new Blob([req.body], { type: contentType }), `chunk.${ext}`);
    form.append("model", "whisper-large-v3");
    form.append("prompt", "TalkMeter, Avalanche, Fuji, USDC, x402, smart contract.");
    form.append("response_format", "json");

    const groqRes = await fetch(STT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: form,
    });

    if (!groqRes.ok) {
      console.error("[Loi Groq STT]:", await groqRes.text());
      return res.status(502).json({ error: "Loi STT. Ban khong bi tru tien." });
    }

    const data = await groqRes.json();
    const text = (data.text || "").trim();
    const transcriptHash = keccak256(toHex(text));
    res.json({ text, transcriptHash, bytesReceived: req.body.length });
  } catch (err) {
    console.error("[Loi /api/transcribe]:", err);
    res.status(500).json({ error: "Loi server. Ban khong bi tru tien." });
  }
});

app.post("/api/summary", async (req, res) => {
  try {
    const { transcript, meetingDate } = req.body || {};
    if (!transcript || typeof transcript !== "string" || transcript.trim().length < 5) {
      return res.status(400).json({ error: "Transcript qua ngan" });
    }

    const today = meetingDate || new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
    const dayOfWeek = new Date().toLocaleDateString("vi-VN", { weekday: "long", timeZone: "Asia/Ho_Chi_Minh" });
    const systemPrompt = [
      "Bạn là trợ lý thư ký cuộc họp TalkMeter. Xuất ra duy nhất 1 đối tượng JSON hợp lệ, không bọc markdown.",
      `Hôm nay là ${dayOfWeek}, ngày ${today}.`,
      "Quy tắc trích xuất action_items:",
      "- owner: Lấy tên người nói ở đầu câu (ví dụ 'Dat:', 'Dung:') hoặc tên người được giao việc. Nếu không rõ thì điền null.",
      "- deadline: Tự tính toán và quy đổi các mốc thời gian tương đối (ví dụ 'ngày mai', 'thứ Sáu tuần này') sang định dạng YYYY-MM-DD dựa vào ngày hôm nay. Nếu không có hạn thì điền null.",
      "- quote: Trích dẫn nguyên văn câu nói trong transcript.",
      'Cấu trúc JSON bắt buộc: {"summary": "Tóm tắt 3-5 câu tiếng Việt", "decisions": ["..."], "action_items": [{"task": "...", "owner": "...", "deadline": "YYYY-MM-DD", "quote": "..."}]}'
    ].join("\n");


    const groqRes = await fetch(LLM_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: transcript },
        ],
      }),
    });

    if (!groqRes.ok) {
      console.error("[Loi Groq LLM]:", await groqRes.text());
      return res.status(502).json({ error: "Loi LLM. Ban khong bi tru tien." });
    }

    const data = await groqRes.json();
    const firstChoice = Array.isArray(data.choices) ? data.choices.at(0) : null;
    const rawContent = firstChoice?.message?.content || "{}";

    let parsedResult;
    try {
      parsedResult = JSON.parse(rawContent);
    } catch {
      return res.status(502).json({ error: "AI tra ve sai JSON" });
    }

    const summaryHash = keccak256(toHex(JSON.stringify(parsedResult)));
    res.json({ ...parsedResult, summaryHash });
  } catch (err) {
    console.error("[Loi /api/summary]:", err);
    res.status(500).json({ error: "Loi server. Ban khong bi tru tien." });
  }
});

app.listen(PORT, () => {
  console.log(`TalkMeter Server chay tai http://localhost:${PORT} | Mang: ${NET.name}`);
});
// --- CẤU HÌNH GHI BIÊN LAI ON-CHAIN (RECEIPT LOG) ---
const RECEIPT_ABI = [
  {
    name: "log",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "sessionId", type: "bytes32" },
      { name: "payer", type: "address" },
      { name: "receiptHash", type: "bytes32" },
      { name: "chunks", type: "uint32" },
      { name: "paidUsdc", type: "uint256" },
    ],
    outputs: [],
  },
];

// Route miễn phí để Server tự động ký và ghi biên lai cuối buổi họp lên Fuji
app.post("/api/receipt", async (req, res) => {
  try {
    const { sessionId, payer, receiptHash, chunks, paidUsdc } = req.body;

    // 1. Kiểm tra cấu hình ví Operator và địa chỉ Contract trong .env.local
    if (!process.env.OPERATOR_PRIVATE_KEY || !process.env.RECEIPT_CONTRACT) {
      return res.status(500).json({ error: "Server chưa cấu hình OPERATOR_PRIVATE_KEY hoặc RECEIPT_CONTRACT" });
    }

    // 2. Chuẩn hóa sessionId thành bytes32 (nếu frontend gửi chuỗi thường như "session-123")
    const sessionBytes32 = sessionId?.startsWith("0x") && sessionId.length === 66
      ? sessionId
      : keccak256(toHex(String(sessionId || Date.now())));

    // 3. Khởi tạo ví Operator để tự động ký giao dịch (không cần popup ví người dùng)
    const operatorAccount = privateKeyToAccount(process.env.OPERATOR_PRIVATE_KEY);
    const walletClient = createWalletClient({
      account: operatorAccount,
      chain: avalancheFuji,
      transport: http(),
    });

    // 4. Gọi hàm log(...) trên Smart Contract ReceiptLog
    const txHash = await walletClient.writeContract({
      address: process.env.RECEIPT_CONTRACT,
      abi: RECEIPT_ABI,
      functionName: "log",
      args: [
        sessionBytes32,
        payer,
        receiptHash,
        Number(chunks || 1),
        BigInt(paidUsdc || 0),
      ],
    });

    // 5. Trả về mã giao dịch và link kiểm chứng trên Snowtrace cho Frontend
    res.json({
      ok: true,
      txHash,
      explorerUrl: `https://snowtrace.io{txHash}`,
    });
  } catch (err) {
    console.error("Lỗi ghi receipt on-chain:", err);
    res.status(500).json({ error: err.shortMessage || err.message || "Ghi receipt thất bại" });
  }
});
