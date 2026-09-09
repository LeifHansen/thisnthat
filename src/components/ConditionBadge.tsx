import type { Condition } from "@prisma/client";
import { conditionLabel } from "@/lib/listingOptions";

// Tone per condition. Kept to the shared badge palette so the card, listing
// page and dashboard all read the same.
const TONE: Record<Condition, string> = {
  NEW: "tnt-badge--on",
  LIKE_NEW: "tnt-badge--good",
  GOOD: "",
  FAIR: "tnt-badge--warn",
  FOR_PARTS: "tnt-badge--error",
};

export function ConditionBadge({
  condition,
  size = "sm",
  className = "",
}: {
  condition: Condition;
  size?: "sm" | "lg";
  className?: string;
}) {
  return (
    <span
      className={`tnt-badge ${TONE[condition]} ${size === "lg" ? "!text-sm !px-3 !py-1" : ""} ${className}`}
      title={`Condition: ${conditionLabel(condition)}`}
    >
      {conditionLabel(condition)}
    </span>
  );
}
