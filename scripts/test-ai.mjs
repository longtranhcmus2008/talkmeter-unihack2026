// One whole paid session against a running server, the way the web app runs it, without a browser or mic:
// every audio file is one chunk paid with x402, then one paid summary that writes the receipt on chain,
// then the receipt is recomputed here and compared with ReceiptLog.
//   npm run server                                  (in another window)
//   npm run test-ai                                 uses test/audio/*.wav
//   npm run test-ai -- a.webm b.webm --interview    your own chunks, interview mode
// Needs BUYER_PRIVATE_KEY with test USDC. Spends PRICE_TRANSCRIBE per file plus PRICE_SUMMARY.
// The sample files are English text-to-speech: start the server with STT_LANGUAGE= so Whisper keeps them English.
import fs from "node:fs";
import path from "node:path";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { decodePaymentResponseHeader, wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { NET, privateKey, stop, toUnits, txLink } from "../src/networks.mjs";
import { RECEIPT_ABI, receiptHash, sessionKey } from "../src/receipt.mjs";

const API = process.env.API_URL || `http://localhost:${process.env.PORT || 4021}`;
const args = process.argv.slice(2);
const mode = args.includes("--interview") ? "interview" : "meeting";
const sampleDir = path.join(import.meta.dirname, "..", "test", "audio");
const files = args.filter((a) => !a.startsWith("--"));
if (!files.length) files.push(...fs.readdirSync(sampleDir).filter((f) => f.endsWith(".wav")).sort().map((f) => path.join(sampleDir, f)));
const TYPES = { wav: "audio/wav", webm: "audio/webm", mp4: "audio/mp4", m4a: "audio/mp4", ogg: "audio/ogg", mp3: "audio/mpeg" };

const account = privateKeyToAccount(privateKey("BUYER_PRIVATE_KEY", "Chạy npm run new-wallet rồi nạp USDC test tại faucet.circle.com."));
const client = x402Client.fromConfig({
  schemes: [{ network: NET.id, client: new ExactEvmScheme(account) }],
  spendControls: { allowedAssets: [{ network: NET.id, asset: NET.usdc, maxAmountPerPayment: toUnits(process.env.MAX_PRICE_USDC || "0.1") }] },
});
const payingFetch = wrapFetchWithPayment(fetch, client);

async function pay(route, init) {
  let res;
  try {
    res = await payingFetch(`${API}${route}`, init);
  } catch (err) {
    if (err?.cause?.code === "ECONNREFUSED") stop(`Không có server ở ${API}. Chạy npm run server trước.`);
    stop(`${route}: ${err.message || err}`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) stop(`${route} trả ${res.status}: ${data.error || "không rõ lỗi"}`);
  const header = res.headers.get("PAYMENT-RESPONSE");
  return { data, txHash: header ? decodePaymentResponseHeader(header).transaction : null };
}

const config = await (await fetch(`${API}/api/config`).catch(() => stop(`Không có server ở ${API}. Chạy npm run server trước.`))).json();
const sessionId = `tm-cli-${crypto.randomUUID()}`;
console.log(`Phiên ${sessionId} trên ${config.network.name}, ví ${account.address}, ${files.length} đoạn, chế độ ${mode}\n`);

const chunks = [];
for (const [i, file] of files.entries()) {
  const ext = path.extname(file).slice(1).toLowerCase();
  const { data, txHash } = await pay("/api/transcribe", {
    method: "POST",
    headers: { "Content-Type": TYPES[ext] || "audio/webm" },
    body: fs.readFileSync(file),
  });
  if (!txHash) stop(`Đoạn ${i + 1}: server không trả mã giao dịch.`);
  chunks.push({ index: i + 1, text: data.text, transcriptHash: data.transcriptHash, txHash });
  console.log(`Đoạn ${i + 1}  ${config.prices.transcribe} USDC  ${txLink(txHash)}\n  “${data.text}”`);
}

const { data: result, txHash: summaryTx } = await pay("/api/summary", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    mode,
    transcript: chunks.map((c) => `[Đoạn ${c.index}] ${c.text}`).join("\n"),
    sessionId,
    payer: account.address,
    chunks: chunks.map(({ index, transcriptHash, txHash }) => ({ index, transcriptHash, txHash })),
  }),
});
console.log(`\nTóm tắt  ${config.prices.summary} USDC  ${txLink(summaryTx)}\n  ${result.summary}`);
for (const d of result.decisions) console.log(`  - ${d}`);
for (const a of result.action_items) console.log(`  * ${a.task} | ${a.owner ?? "?"} | ${a.deadline ?? "?"}`);

if (!result.receipt) stop(`\nChưa ghi được receipt: ${result.receiptError}`);
console.log(`\nReceipt  ${result.receipt.receiptHash}\n  ${result.receipt.explorerUrl || "(đã có sẵn trên chain)"}`);

const chain = createPublicClient({ chain: NET.chain, transport: http(NET.rpc) });
const onChain = await chain.readContract({ address: config.receiptContract, abi: RECEIPT_ABI, functionName: "receiptOf", args: [sessionKey(sessionId)] });
const local = receiptHash(sessionId, chunks);
if (local.toLowerCase() !== onChain.toLowerCase()) stop(`Không khớp: tính lại ${local}, trên chain ${onChain}`);
console.log(`\nKhớp. Hash tính lại từ ${chunks.length} đoạn trùng với ReceiptLog trên ${config.network.name}.`);

const out = `talkmeter-receipt-${sessionId}.json`;
fs.writeFileSync(out, JSON.stringify({ sessionId, network: config.network.name, contract: config.receiptContract, payer: account.address, receiptHash: local, receiptTx: result.receipt.txHash, chunks }, null, 2));
console.log(`Đã lưu ${out}; kiểm chứng lại bất cứ lúc nào: npm run verify-receipt -- ${out}`);
