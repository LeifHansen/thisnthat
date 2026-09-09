"use client";

import { useState } from "react";
import type { PayoutStatus } from "@/lib/payout";

const LABELS: Record<PayoutStatus, string> = {
  none: "Set Up Seller Payouts",
  incomplete: "Finish Payout Setup →",
  pending: "Check Verification Status",
  enabled: "Manage Payout Account",
};

export function ConnectButton({ status }: { status: PayoutStatus }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function go() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/stripe/connect", { method: "POST" });

      // Parse only what is actually JSON. This used to call res.json()
      // unconditionally and before checking res.ok, so anything that answered
      // with HTML — a Cloudflare challenge page on the public domain, a 502
      // from a machine still cold-starting — surfaced to the seller as
      // "Unexpected token '<'" and left the button dead. The server side of
      // this route already guards against exactly that; the client didn't.
      const isJson = res.headers
        .get("content-type")
        ?.includes("application/json");
      const data = isJson ? await res.json().catch(() => null) : null;

      if (!res.ok || !data?.url) {
        throw new Error(
          data?.error ??
            (res.status === 401
              ? "Your session expired — sign in again to set up payouts."
              : `Couldn't reach payout setup (error ${res.status}). Please try again.`),
        );
      }
      window.location.href = data.url;
    } catch (e) {
      // A dropped connection lands here too, with a browser-specific message.
      setErr(
        e instanceof Error && e.message
          ? e.message
          : "Couldn't reach payout setup. Please try again.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button className="bx-btn" onClick={go} disabled={busy}>
        {busy ? "Redirecting…" : LABELS[status]}
      </button>
      {err && (
        <p className="text-red-600 text-sm">
          {err}{" "}
          <button onClick={go} className="underline font-semibold">
            Retry
          </button>
        </p>
      )}
    </div>
  );
}
