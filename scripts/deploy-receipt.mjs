// Compiles contracts/ReceiptLog.sol and deploys it with the operator wallet: `npm run deploy-receipt`.
// The operator needs a little test AVAX (Core faucet) to pay the gas. Put the printed address in RECEIPT_CONTRACT.
import fs from "node:fs";
import solc from "solc";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { NET, stop, txLink } from "../src/networks.mjs";

const key = (process.env.OPERATOR_PRIVATE_KEY || "").replace(/^(?!0x)/, "0x");
if (!/^0x[0-9a-fA-F]{64}$/.test(key)) stop("Đặt OPERATOR_PRIVATE_KEY trong .env.local (chạy npm run new-wallet để tạo).");

const source = fs.readFileSync("contracts/ReceiptLog.sol", "utf8");
const output = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: "Solidity",
      sources: { "ReceiptLog.sol": { content: source } },
      settings: { outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } } },
    })
  )
);
const errors = (output.errors || []).filter((e) => e.severity === "error");
if (errors.length) stop(errors.map((e) => e.formattedMessage).join("\n"));
const { abi, evm } = output.contracts["ReceiptLog.sol"].ReceiptLog;

const account = privateKeyToAccount(key);
const chain = createPublicClient({ chain: NET.chain, transport: http(NET.rpc) });
const wallet = createWalletClient({ account, chain: NET.chain, transport: http(NET.rpc) });

console.log(`Deploy ReceiptLog lên ${NET.name} từ ví operator ${account.address}...`);
const hash = await wallet.deployContract({ abi, bytecode: `0x${evm.bytecode.object}` });
const receipt = await chain.waitForTransactionReceipt({ hash });
console.log(`Giao dịch: ${txLink(hash)}`);
console.log(`RECEIPT_CONTRACT=${receipt.contractAddress}`);
