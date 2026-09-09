import type { AuthType } from "@prisma/client";

// Short, low-key labels — the badge informs without dominating the card.
const MAP: Record<AuthType, { label: string; icon: string; color: string }> = {
  BX_FULL_SERVICE: { label: "BX Verified", icon: "✓", color: "#8a4fb0" },
  TRUE_BLUE: { label: "True Blue", icon: "✓", color: "#3b8ed0" },
  BX_EXPRESS_COA: { label: "BX · COA", icon: "✓", color: "#46a85a" },
  THIRD_PARTY_COA: { label: "COA", icon: "✓", color: "#d98a2c" },
  UNAUTHENTICATED: { label: "As-Is", icon: "•", color: "#9c8c6e" },
};

export function AuthBadge({
  authType,
  registrationNumber,
  grade,
  size = "sm",
}: {
  authType: AuthType;
  registrationNumber?: string | null;
  grade?: string | null;
  size?: "sm" | "lg";
}) {
  const m = MAP[authType];
  // Extra detail (grade / registry no.) only shows on the larger detail-page
  // variant so listing cards stay clean.
  const detail =
    size === "lg"
      ? `${grade ? ` · ${grade}` : ""}${
          registrationNumber ? ` · #${registrationNumber}` : ""
        }`
      : "";
  return (
    <span
      className={`bx-authchip ${size === "lg" ? "bx-authchip--lg" : ""}`}
      style={{ color: m.color }}
      title={`${m.label}${detail}`}
    >
      <span aria-hidden className="bx-authchip__icon">
        {m.icon}
      </span>
      {m.label}
      {detail}
    </span>
  );
}
