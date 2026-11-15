// Script kiem tra thanh toan that 0.05 USDC qua x402 cho API /api/summary
import { privateKeyToAccount } from "viem/accounts";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment, x402Client, decodePaymentResponseHeader } from "@x402/fetch";
import { NET, privateKey, txLink } from "../src/networks.mjs";

const PORT = Number(process.env.PORT || 4021);
const BUYER_KEY = privateKey("BUYER_PRIVATE_KEY", "Chay npm run new-wallet de tao vi.");
const account = privateKeyToAccount(BUYER_KEY);

// Khoi tao x402 client voi han muc toi da 0.10 USDC (100000 don vi)
const client = x402Client.fromConfig({
  schemes: [{ network: NET.id, client: new ExactEvmScheme(account) }],
  spendControls: {
    allowedAssets: [{ network: NET.id, asset: NET.usdc, maxAmountPerPayment: "100000" }],
  },
});

const payingFetch = wrapFetchWithPayment(fetch, client);

// Du lieu transcript cuoc hop gia dinh bang tieng Viet
const sampleTranscript = `
Leader: Chao ca nhom, hom nay chung ta chot tien do du an TalkMeter cho cuoc thi Avalanche UniHack.
Dat: Minh da lam xong phan thu am cat doan 60 giay tren trinh duyet, ngay mai minh se ghep xong giao dien hien thi transcript.
Dung: Con minh da chuan bi xong bang tinh Unit Economics va phap ly Viet Nam, thu Sau tuan nay minh se nop ban slide hoan chinh.
Leader: Ok chot vay nhe, moi nguoi co gang hoan thanh dung han.
`;

console.log(`Dang gui yeu cau tom tat kem thanh toan 0.05 USDC tu vi ${account.address}...`);

const res = await payingFetch(`http://localhost:${PORT}/api/summary`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ transcript: sampleTranscript }),
});

const paymentHeader = res.headers.get("payment-response");
const receipt = paymentHeader ? decodePaymentResponseHeader(paymentHeader) : null;
const data = await res.json();

console.log("Trang thai HTTP:", res.status);
if (receipt?.transaction) {
  console.log("Link giao dich Snowtrace:", txLink(receipt.transaction));
}
console.log("Ket qua JSON tu Groq AI:\n", JSON.stringify(data, null, 2));
