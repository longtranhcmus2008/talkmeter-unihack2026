// The browser is the buyer. It holds a throwaway session key, signs one USDC transfer per request
// (EIP-3009, no AVAX needed) and never sends a transaction itself: the facilitator does that.
import { createPublicClient, erc20Abi, formatUnits, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { avalanche, avalancheFuji } from "viem/chains";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { decodePaymentResponseHeader, wrapFetchWithPayment, x402Client } from "@x402/fetch";

const KEY = "tm_session_key";

export const chainFor = (network) => (network.chainId === avalanche.id ? avalanche : avalancheFuji);
export const publicClientFor = (network) => createPublicClient({ chain: chainFor(network), transport: http() });

function walletFrom(key) {
  const account = privateKeyToAccount(key);
  return { account, address: account.address, key };
}

// The key lives in localStorage so a page reload does not strand the USDC that was sent to it.
export function loadSessionWallet() {
  let key = localStorage.getItem(KEY) || sessionStorage.getItem(KEY);
  if (!/^0x[0-9a-fA-F]{64}$/.test(key || "")) key = generatePrivateKey();
  localStorage.setItem(KEY, key);
  return walletFrom(key);
}

export function newSessionWallet() {
  const key = generatePrivateKey();
  localStorage.setItem(KEY, key);
  return walletFrom(key);
}

export async function usdcBalance(client, network, address) {
  const raw = await client.readContract({ address: network.usdc, abi: erc20Abi, functionName: "balanceOf", args: [address] });
  return Number(formatUnits(raw, 6));
}

// Returns a function that calls a paid route and reports the settlement transaction.
// maxMicro is the library-level cap: the server cannot ask for more than this per request.
export function createPaidCaller(account, network, maxMicro) {
  const client = x402Client.fromConfig({
    schemes: [{ network: network.id, client: new ExactEvmScheme(account) }],
    spendControls: {
      allowedAssets: [{ network: network.id, asset: network.usdc, maxAmountPerPayment: String(maxMicro) }],
    },
  });
  const payingFetch = wrapFetchWithPayment(fetch, client);

  return async function callPaid(url, options) {
    let response;
    try {
      response = await payingFetch(url, options);
    } catch (err) {
      const message = String(err?.message || err);
      if (/spendControls/i.test(message)) throw new Error("Server đòi giá cao hơn hạn mức cho phép. Không ký thanh toán.");
      throw new Error(`Không gọi được server: ${message}`);
    }

    if (response.status === 402) {
      let reason = "";
      try {
        reason = decodePaymentRequiredHeader(response.headers.get("PAYMENT-REQUIRED"))?.error || "";
      } catch {
        /* header missing or unreadable */
      }
      if (/insufficient/i.test(reason)) throw new Error("Ví phiên không đủ USDC. Nạp thêm USDC test rồi thử lại.");
      throw new Error(`Thanh toán bị từ chối${reason ? `: ${reason}` : ""}. Bạn không bị trừ tiền.`);
    }

    let txHash = null;
    const header = response.headers.get("PAYMENT-RESPONSE");
    if (header) {
      try {
        txHash = decodePaymentResponseHeader(header)?.transaction || null;
      } catch {
        /* settled but unreadable: treated as unconfirmed */
      }
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `Lỗi HTTP ${response.status}. Bạn không bị trừ tiền.`);
    return { data, txHash };
  };
}
