// The meter: each digit sits on its own drum and rolls to the next value, like a taxi meter.
const DIGITS = "0123456789";

export default function Odometer({ value, label }) {
  return (
    <div className="odometer" role="img" aria-label={label}>
      {[...value].map((ch, i) =>
        ch === "." ? (
          <span key={i} className="odo-point">.</span>
        ) : (
          <span key={i} className="odo-window">
            <span className="odo-drum" style={{ transform: `translateY(${-Number(ch) * 10}%)` }}>
              {[...DIGITS].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </span>
          </span>
        )
      )}
    </div>
  );
}
