// The four steps of one x402 payment, in order. Shown under the meter for judges and first-time users.
const STEPS = [
  ["Gửi đoạn âm thanh", "Trình duyệt gửi đoạn vừa ghi. Server trả 402 kèm giá, mạng và ví nhận."],
  ["Ký đúng khoản đó", "Ví phiên ký một lệnh chuyển USDC (EIP-3009). Không gửi giao dịch, không cần AVAX."],
  ["Chuyển giọng nói", "Facilitator kiểm tra chữ ký rồi server gọi Whisper. Lỗi ở bước này thì không ai bị trừ tiền."],
  ["Settle lên Avalanche", "Facilitator đưa lệnh chuyển lên chain và trả mã giao dịch về vé của đoạn đó."],
];

export default function HowItWorks({ price, network }) {
  return (
    <section className="how" aria-labelledby="how-title">
      <h2 id="how-title">
        Một đoạn, một lần trả {price} USDC trên {network}
      </h2>
      <ol>
        {STEPS.map(([title, body]) => (
          <li key={title}>
            <strong>{title}</strong>
            <p>{body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
