import test from "node:test";
import assert from "node:assert/strict";
import { receiptHash, textHash } from "../src/receipt.mjs";
import { receiptHash as clientReceiptHash, textHash as clientTextHash } from "../client/src/lib/receipt.js";

const tx = (n) => `0x${n.toString(16).padStart(64, "0")}`;
const chunks = [
  { index: 2, transcriptHash: textHash("Dũng: thứ Sáu nộp slide."), txHash: tx(2) },
  { index: 1, transcriptHash: textHash("Đạt: mai xong giao diện."), txHash: tx(1) },
];

test("server and browser compute the same receipt", () => {
  assert.equal(clientTextHash("Xin chào"), textHash("Xin chào"));
  assert.equal(clientReceiptHash("tm-1", chunks), receiptHash("tm-1", chunks));
});

test("order of arrival does not change the receipt", () => {
  assert.equal(receiptHash("tm-1", chunks), receiptHash("tm-1", [...chunks].reverse()));
});

test("editing one letter of one minute changes the receipt", () => {
  const edited = [{ ...chunks[0], transcriptHash: textHash("Dũng: thứ Bảy nộp slide.") }, chunks[1]];
  assert.notEqual(receiptHash("tm-1", edited), receiptHash("tm-1", chunks));
});

test("another session with the same minutes has another receipt", () => {
  assert.notEqual(receiptHash("tm-2", chunks), receiptHash("tm-1", chunks));
});
