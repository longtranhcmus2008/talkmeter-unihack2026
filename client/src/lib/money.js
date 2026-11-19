// USDC has 6 decimals. All budget maths runs on whole micro-units so 0.1 + 0.2 never drifts.
export const toMicro = (usdc) => Math.round(Number(usdc) * 1_000_000);
export const fromMicro = (micro) => micro / 1_000_000;
export const fmt = (micro, digits = 4) => fromMicro(micro).toFixed(digits);
export const short = (hex, head = 6, tail = 4) => (hex ? `${hex.slice(0, head)}…${hex.slice(-tail)}` : "");
