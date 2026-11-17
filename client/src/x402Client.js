import { createPublicClient, http, formatUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment, x402Client, decodePaymentResponseHeader } from "@x402/fetch";

export const FUJI_NETWORK = "eip155:43113";
export const FUJI_USDC = "0x5425890298aed601595a70AB815c96711a31Bc65";

const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
];

const publicClient = createPublicClient({
  chain: avalancheFuji,
  transport: http(),
});

export function getSessionWallet() {
  let key = sessionStorage.getItem("tm_session_key");
  if (!key) {
    key = generatePrivateKey();
    sessionStorage.setItem("tm_session_key", key);
  }
  const account = privateKeyToAccount(key);
  return { account, address: account.address };
}

export function resetSessionWallet() {
  const key = generatePrivateKey();
  sessionStorage.setItem("tm_session_key", key);
  const account = privateKeyToAccount(key);
  return { account, address: account.address };
}

export async function getUsdcBalance(address) {
  const raw = await publicClient.readContract({
    address: FUJI_USDC,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address],
  });
  return Number(formatUnits(raw, 6));
}

export function createPayingFetch(account) {
  const client = x402Client.fromConfig({
    schemes: [{ network: FUJI_NETWORK, client: new ExactEvmScheme(account) }],
    spendControls: {
      allowedAssets: [
        {
          network: FUJI_NETWORK,
          asset: FUJI_USDC,
          maxAmountPerPayment: "50000",
        },
      ],
    },
  });

  const wrappedFetch = wrapFetchWithPayment(fetch, client);

  return async function callPaidApi(url, options) {
    const response = await wrappedFetch(url, options);
    const paymentHeader = response.headers.get("PAYMENT-RESPONSE");
    let txHash = null;

    if (paymentHeader) {
      try {
        const decoded = decodePaymentResponseHeader(paymentHeader);
        txHash = decoded?.transaction || decoded?.txHash || null;
      } catch (e) {
        console.warn("Không giải mã được PAYMENT-RESPONSE:", e);
      }
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || `Lỗi HTTP ${response.status}`);
    }
    return { data, txHash };
  };
}
