// Same receipt as src/receipt.mjs on the server; test/receipt.test.mjs keeps the two in step.
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

export const RECEIPT_OF_ABI = [
  {
    name: "receiptOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
];
