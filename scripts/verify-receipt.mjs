// Recomputes a session receipt from the JSON file the web app exports, and compares it with the chain:
//   npm run verify-receipt -- talkmeter-receipt-<session>.json
// Needs no key and trusts nobody: it hashes every transcript itself and reads ReceiptLog directly.
import fs from "node:fs";
import { createPublicClient, http, isAddress } from "viem";
import { NET, stop } from "../src/networks.mjs";
import { RECEIPT_ABI, receiptHash, sessionKey, textHash } from "../src/receipt.mjs";

const file = process.argv[2];
if (!file) stop("Cách dùng: npm run verify-receipt -- <file biên lai .json>");
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const contract = process.env.RECEIPT_CONTRACT || data.contract;
if (!isAddress(contract || "")) stop("Không biết địa chỉ ReceiptLog: đặt RECEIPT_CONTRACT hoặc dùng file có trường contract.");

let ok = true;
const chunks = data.chunks.map((c) => {
  const h = textHash(c.text);
  if (h !== c.transcriptHash) {
    ok = false;
    console.log(`Phút ${c.index}: transcript đã bị sửa (hash ${h} khác ${c.transcriptHash}).`);
  }
  return { index: c.index, transcriptHash: h, txHash: c.txHash };
});

const local = receiptHash(data.sessionId, chunks);
const chain = createPublicClient({ chain: NET.chain, transport: http(NET.rpc) });
const onChain = await chain.readContract({ address: contract, abi: RECEIPT_ABI, functionName: "receiptOf", args: [sessionKey(data.sessionId)] });

console.log(`Phiên        ${data.sessionId}`);
console.log(`Tính lại     ${local}`);
console.log(`Trên ${NET.name}  ${onChain}`);
if (ok && local.toLowerCase() === onChain.toLowerCase()) console.log("Khớp. Transcript và danh sách thanh toán đúng như lúc ghi receipt.");
else stop("Không khớp. Biên lai này không khớp với dữ liệu trên chain.");
