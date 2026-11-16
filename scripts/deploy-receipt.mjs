import fs from "node:fs";
import solc from "solc";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";

// 1. Lấy Private Key ví Operator từ file .env.local
const privateKey = process.env.OPERATOR_PRIVATE_KEY;
if (!privateKey) {
  console.error("Lỗi: Chưa cấu hình OPERATOR_PRIVATE_KEY trong .env.local");
  process.exit(1);
}

// 2. Đọc code Solidity từ file contracts/ReceiptLog.sol
const sourceCode = fs.readFileSync("contracts/ReceiptLog.sol", "utf8");

// 3. Cấu hình và biên dịch code Solidity
const input = {
  language: "Solidity",
  sources: { "ReceiptLog.sol": { content: sourceCode } },
  settings: { outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } } },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const contractFile = output.contracts["ReceiptLog.sol"]["ReceiptLog"];
const abi = contractFile.abi;
const bytecode = `0x${contractFile.evm.bytecode.object}`;

// 4. Kết nối mạng Avalanche Fuji bằng ví Operator
const account = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({ chain: avalancheFuji, transport: http() });
const walletClient = createWalletClient({ account, chain: avalancheFuji, transport: http() });

console.log(`Đang deploy ReceiptLog từ ví Operator: ${account.address}...`);

// 5. Gửi lệnh deploy và chờ xác nhận trên blockchain
const hash = await walletClient.deployContract({ abi, bytecode });
console.log(`Tx Hash: ${hash} - Đang chờ xác nhận...`);

const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log("==========================================");
console.log("DEPLOY THÀNH CÔNG!");
console.log(`RECEIPT_CONTRACT=${receipt.contractAddress}`);
console.log("==========================================");
