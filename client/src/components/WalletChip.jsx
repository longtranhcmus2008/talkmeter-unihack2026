import { useState } from "react";
import { short } from "../lib/money";

export default function WalletChip({ wallet, balance, network, locked, onNewWallet }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const renew = () => {
    const warn = balance > 0 ? `Ví hiện tại còn ${balance.toFixed(4)} USDC. Tạo ví mới sẽ mất quyền dùng số USDC này. ` : "";
    if (window.confirm(`${warn}Tạo ví phiên mới?`)) onNewWallet();
  };

  return (
    <div className="wallet">
      <button type="button" className="wallet-chip" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="wallet-addr">{short(wallet.address)}</span>
        <span className="wallet-bal">{balance === null ? "…" : balance.toFixed(4)} USDC</span>
      </button>
      {open && (
        <div className="wallet-pop">
          <p className="muted">
            Ví phiên được tạo ngay trong trình duyệt. Nó tự ký từng khoản nhỏ nên bạn không phải bấm ký mỗi phút. Chỉ nạp số tiền nhỏ.
          </p>
          <code className="wallet-full">{wallet.address}</code>
          <div className="wallet-actions">
            <button type="button" className="btn btn-quiet" onClick={copy}>
              {copied ? "Đã copy" : "Copy địa chỉ"}
            </button>
            {network?.key === "fuji" && (
              <a className="btn btn-quiet" href="https://faucet.circle.com" target="_blank" rel="noreferrer">
                Lấy USDC test
              </a>
            )}
            <button type="button" className="btn btn-quiet" onClick={renew} disabled={locked}>
              Tạo ví mới
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
