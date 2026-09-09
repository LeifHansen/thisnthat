/**
 * Beanie Xchange brand icon set — original SVGs.
 * Heart-tag (exchange), rainbow peace sign, "Beanie" coin, shopping basket.
 */

const CREAM = "#fff8ec";

export function HeartTagIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Trade"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M50 84 C 22 63, 16 40, 31 29 C 41 22, 50 28, 50 39 C 50 28, 59 22, 69 29 C 84 40, 78 63, 50 84 Z"
        fill="#e23b30"
        stroke="#b82c23"
        strokeWidth="2"
      />
      <circle cx="50" cy="40" r="3.4" fill={CREAM} />
      <g stroke={CREAM} strokeWidth="5" strokeLinecap="round">
        <line x1="37" y1="50" x2="58" y2="50" />
        <line x1="63" y1="61" x2="42" y2="61" />
      </g>
      <path d="M57 44 L66 50 L57 56 Z" fill={CREAM} />
      <path d="M43 55 L34 61 L43 67 Z" fill={CREAM} />
    </svg>
  );
}

export function PeaceIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Connect"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="bxPeaceGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e8413a" />
          <stop offset="20%" stopColor="#ef8a2c" />
          <stop offset="40%" stopColor="#f3c12f" />
          <stop offset="60%" stopColor="#46a85a" />
          <stop offset="80%" stopColor="#3b8ed0" />
          <stop offset="100%" stopColor="#8a4fb0" />
        </linearGradient>
      </defs>
      <g
        stroke="url(#bxPeaceGrad)"
        strokeWidth="9"
        fill="none"
        strokeLinecap="round"
      >
        <circle cx="50" cy="50" r="38" />
        <line x1="50" y1="12" x2="50" y2="88" />
        <line x1="50" y1="50" x2="23" y2="77" />
        <line x1="50" y1="50" x2="77" y2="77" />
      </g>
    </svg>
  );
}

export function CoinIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Beanie coin"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="50" cy="50" r="45" fill="#c2912f" />
      <circle cx="50" cy="50" r="38" fill="#edc457" />
      <circle
        cx="50"
        cy="50"
        r="38"
        fill="none"
        stroke="#d9a93e"
        strokeWidth="3"
      />
      <text
        x="50"
        y="51"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--font-fredoka), sans-serif"
        fontWeight="700"
        fontSize="15"
        fill="#5a431c"
      >
        Beanie
      </text>
    </svg>
  );
}

export function BasketIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Basket"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g fill="none" stroke="#5b5957" strokeWidth="7" strokeLinecap="round">
        <path d="M32 46 Q36 24 50 24" />
        <path d="M68 46 Q64 24 50 24" />
      </g>
      <path d="M20 46 L80 46 L71 82 L29 82 Z" fill="#5b5957" />
      <g stroke="#f4e9d4" strokeWidth="4" strokeLinecap="round">
        <line x1="38" y1="54" x2="41" y2="74" />
        <line x1="50" y1="54" x2="50" y2="74" />
        <line x1="62" y1="54" x2="59" y2="74" />
      </g>
      <rect x="16" y="42" width="68" height="9" rx="4.5" fill="#46443f" />
    </svg>
  );
}
