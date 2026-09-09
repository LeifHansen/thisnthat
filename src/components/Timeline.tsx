import type { OrderStatus } from "@prisma/client";
import { ORDER_STEPS } from "@/lib/orderState";

export function Timeline({ status }: { status: OrderStatus }) {
  const failed = status === "CANCELLED" || status === "REFUNDED";
  const idx = ORDER_STEPS.findIndex((s) => s.status === status);

  return (
    <ol className="space-y-2">
      {ORDER_STEPS.map((s, i) => {
        const done = idx >= 0 && i < idx;
        const current = i === idx;
        return (
          <li key={s.status} className="flex items-start gap-3">
            <span
              className={`tnt-badge ${
                current ? "tnt-badge--on !text-white" : ""
              }`}
            >
              {done ? "✓" : current ? "▶" : "•"}
            </span>
            <div>
              <p
                className={
                  current
                    ? "font-semibold text-[var(--tnt-red)]"
                    : done
                      ? "text-[var(--tnt-success)]"
                      : "text-muted"
                }
              >
                {s.label}
              </p>
              <p className="text-muted text-sm">{s.blurb}</p>
            </div>
          </li>
        );
      })}
      {failed && (
        <li className="tnt-badge !text-red-600 !border-red-600">✗ {status}</li>
      )}
    </ol>
  );
}
