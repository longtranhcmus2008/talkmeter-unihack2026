// The session receipt: one hash that stands for every paid minute of a meeting.
//
//   h0 = keccak256(sessionId)
//   hi = keccak256(h(i-1) || keccak256(transcript_i) || txHash_i)      (32 bytes each, packed)
//
// Anyone holding the transcript and the payment hashes can recompute hn and compare it with
// ReceiptLog.receiptOf(keccak256(sessionId)) on chain. Changing one letter of any minute changes hn.
// client/src/lib/receipt.js holds the same function; test/receipt.test.mjs checks that both agree.
import { encodePacked, keccak256, toHex } from "viem";

export const sessionKey = (sessionId) => keccak256(toHex(sessionId));
export const textHash = (text) => keccak256(toHex(text));

export function receiptHash(sessionId, chunks) {
  let h = sessionKey(sessionId);
  for (const c of [...chunks].sort((a, b) => a.index - b.index)) {
    h = keccak256(encodePacked(["bytes32", "bytes32", "bytes32"], [h, c.transcriptHash, c.txHash]));
  }
  return h;
}

export const RECEIPT_ABI = [
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
  {
    name: "receiptOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
];
