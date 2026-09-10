/**
 * This'n'that icon set — original inline SVGs in the brand palette.
 * Price tag (list it), shield (payment held), truck (shipped), coin
 * (earnings), basket (cart).
 */

const TERRACOTTA = "#d9553b";
const TERRACOTTA_DARK = "#b8432c";
const TEAL = "#1f7a8c";
const MUSTARD = "#e8b43a";
const MUSTARD_DARK = "#a3761a";
const SAGE = "#7a9e7e";
const INK = "#1f1a17";
const PAPER = "#faf7f2";

export function TagIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="List it"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform="rotate(-32 50 50)">
        <path
          d="M18 50 L34 34 H78 Q84 34 84 40 V60 Q84 66 78 66 H34 Z"
          fill={TEAL}
          transform="translate(-6 -10)"
        />
        <path
          d="M18 50 L34 34 H78 Q84 34 84 40 V60 Q84 66 78 66 H34 Z"
          fill={TERRACOTTA}
          stroke={PAPER}
          strokeWidth="3"
          strokeLinejoin="round"
          transform="translate(6 10)"
        />
        <circle cx="36" cy="60" r="3.5" fill={PAPER} />
      </g>
    </svg>
  );
}

export function ShieldIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Payment held safely"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M50 12 L82 24 V50 C82 68 68 82 50 90 C32 82 18 68 18 50 V24 Z"
        fill={TEAL}
      />
      <path
        d="M50 20 L74 29 V50 C74 63 64 74 50 81 C36 74 26 63 26 50 V29 Z"
        fill="#2b93a6"
      />
      <path
        d="M38 51 L47 60 L64 41"
        fill="none"
        stroke={PAPER}
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TruckIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Shipped"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="8" y="30" width="54" height="36" rx="5" fill={TERRACOTTA} />
      <path d="M62 40 H78 L90 54 V66 H62 Z" fill={TERRACOTTA_DARK} />
      <path d="M68 45 H76 L84 54 H68 Z" fill={PAPER} />
      <circle cx="26" cy="70" r="8" fill={INK} />
      <circle cx="26" cy="70" r="3.5" fill={PAPER} />
      <circle cx="74" cy="70" r="8" fill={INK} />
      <circle cx="74" cy="70" r="3.5" fill={PAPER} />
      <g stroke={SAGE} strokeWidth="4" strokeLinecap="round">
        <line x1="10" y1="76" x2="16" y2="76" />
        <line x1="4" y1="84" x2="20" y2="84" />
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
      aria-label="Earnings"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="50" cy="50" r="45" fill={MUSTARD_DARK} />
      <circle cx="50" cy="50" r="38" fill={MUSTARD} />
      <circle
        cx="50"
        cy="50"
        r="38"
        fill="none"
        stroke="#d19f2a"
        strokeWidth="3"
      />
      <text
        x="50"
        y="52"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="inherit"
        fontWeight="700"
        fontSize="44"
        fill="#5a431c"
      >
        $
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
      <g fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round">
        <path d="M32 46 Q36 24 50 24" />
        <path d="M68 46 Q64 24 50 24" />
      </g>
      <path d="M20 46 L80 46 L71 82 L29 82 Z" fill={INK} />
      <g stroke={PAPER} strokeWidth="4" strokeLinecap="round">
        <line x1="38" y1="54" x2="41" y2="74" />
        <line x1="50" y1="54" x2="50" y2="74" />
        <line x1="62" y1="54" x2="59" y2="74" />
      </g>
      <rect x="16" y="42" width="68" height="9" rx="4.5" fill={TERRACOTTA} />
    </svg>
  );
}
