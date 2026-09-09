import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin, isSuperadmin } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { reconcileStuckAuthRequests } from "@/lib/authPayment";
import { formatCents, authServiceLabel } from "@/lib/fees";
import {
  authReceiveAtCenter,
  authReview,
  authRecordReturn,
  approveBeanieSubmission,
  rejectBeanieSubmission,
} from "@/lib/actions";
import { AdminHeader } from "../AdminHeader";
import { loadQueueCount } from "../data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Authentication Queue · Admin",
  robots: { index: false, follow: false },
};

async function loadRequests() {
  // The queue starts at AWAITING_INBOUND, and only the Stripe webhook moves a
  // paid submission there — so a missed webhook leaves a *paid* sale invisible
  // here (the operator only finds the charge in Stripe). Reconcile stuck
  // requests against Stripe before reading; best-effort and cheap when
  // nothing is stuck.
  await reconcileStuckAuthRequests();
  // Actionable work is loaded in full; PASSED/FAILED are terminal and grow
  // forever, so only the most recent are shown (they're here for reference —
  // recording the return shipment — not as an archive).
  const [actionable, recentTerminal] = await Promise.all([
    prisma.authenticationRequest.findMany({
      where: { status: { in: ["AWAITING_INBOUND", "AT_CENTER", "IN_REVIEW"] } },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.authenticationRequest.findMany({
      where: { status: { in: ["PASSED", "FAILED"] } },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);
  const requests = [...actionable, ...recentTerminal];

  // How many beanies share each box, so the receive/return buttons can say
  // that they act on the whole batch (one box in, one box out).
  const batchIds = [
    ...new Set(requests.flatMap((r) => (r.batchId ? [r.batchId] : []))),
  ];
  const sizes =
    batchIds.length > 0
      ? await prisma.authenticationRequest.groupBy({
          by: ["batchId"],
          where: { batchId: { in: batchIds } },
          _count: { _all: true },
        })
      : [];
  const batchSize = new Map<string, number>();
  for (const g of sizes) if (g.batchId) batchSize.set(g.batchId, g._count._all);
  return { requests, batchSize };
}

function loadNewBeanies() {
  return prisma.beanieSubmission.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export default async function AdminQueuePage() {
  const admin = await requireAdmin();

  // Load each pane independently so a failure in one query (e.g. a table that
  // isn't present in this environment) degrades to an inline notice instead of
  // crashing the whole dashboard with a 500.
  let requests: Awaited<ReturnType<typeof loadRequests>>["requests"] = [];
  let batchSize: Awaited<ReturnType<typeof loadRequests>>["batchSize"] =
    new Map();
  let newBeanies: Awaited<ReturnType<typeof loadNewBeanies>> = [];
  let requestsError = false;
  let newBeaniesError = false;

  try {
    ({ requests, batchSize } = await loadRequests());
  } catch (e) {
    console.error("admin: failed to load authentication queue", e);
    requestsError = true;
  }

  try {
    newBeanies = await loadNewBeanies();
  } catch (e) {
    console.error("admin: failed to load new beanie submissions", e);
    newBeaniesError = true;
  }

  const queueCount = await loadQueueCount();

  return (
    <div className="space-y-6">
      <AdminHeader isSuperadmin={isSuperadmin(admin)} queueCount={queueCount} />

      <section id="database-queue" className="space-y-3 scroll-mt-24">
        <div className="flex items-end justify-between gap-3">
          <h1 className="text-ink text-2xl">New beanie submissions</h1>
          {newBeanies.length > 0 && (
            <span className="rounded-full bg-[var(--tnt-red)] text-white text-xs font-bold px-2.5 py-1">
              {newBeanies.length} pending
            </span>
          )}
        </div>
        <p className="text-muted text-sm">
          Sellers listed these beanies, which aren&apos;t in the catalogue yet.
          The listings are already live — review and approve or reject the new
          beanie entry.
        </p>
        {newBeaniesError ? (
          <div className="tnt-panel p-6 text-center text-[var(--tnt-red)]">
            Couldn&apos;t load new beanie submissions. The database schema may
            be out of date in this environment.
          </div>
        ) : newBeanies.length === 0 ? (
          <div className="tnt-panel p-6 text-center text-muted">
            No new beanies to review.
          </div>
        ) : (
          <div className="space-y-2">
            {newBeanies.map((b) => (
              <div
                key={b.id}
                className="tnt-panel p-4 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-bold text-ink">
                    {b.name}
                    {b.year ? (
                      <span className="text-muted font-normal"> · {b.year}</span>
                    ) : null}
                  </p>
                  <p className="text-muted text-xs">
                    {b.submittedByName ? `by ${b.submittedByName} · ` : ""}
                    {b.createdAt.toISOString().slice(0, 10)}
                    {b.firstListingId ? (
                      <>
                        {" · "}
                        <Link
                          href={`/listings/${b.firstListingId}`}
                          className="!text-[var(--tnt-red)] font-semibold"
                        >
                          view listing →
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <form action={approveBeanieSubmission}>
                    <input type="hidden" name="submissionId" value={b.id} />
                    <button
                      className="tnt-btn tnt-btn--green !py-1.5 !px-4"
                      type="submit"
                    >
                      Approve
                    </button>
                  </form>
                  <form action={rejectBeanieSubmission}>
                    <input type="hidden" name="submissionId" value={b.id} />
                    <button
                      className="tnt-btn tnt-btn--ghost !py-1.5 !px-4"
                      type="submit"
                    >
                      Reject
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <h1 id="auth-queue" className="text-ink text-2xl scroll-mt-24">
        Authentication Center — Queue
      </h1>
      <p className="text-muted">
        Paid Full Authentication submissions. Two tracks: <b>True&nbsp;Blue</b>{" "}
        (drop-ship to TBB; record their cert &amp; grade) and{" "}
        <b>BX Authentication</b> (in-house — grade it yourself).
      </p>

      {requestsError ? (
        <div className="tnt-panel p-8 text-center text-[var(--tnt-red)]">
          Couldn&apos;t load the authentication queue. The database schema may
          be out of date in this environment.
        </div>
      ) : requests.length === 0 ? (
        <div className="tnt-panel p-8 text-center text-muted">
          Queue is empty.
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((r) => {
            const isTrueBlue = r.provider === "TRUE_BLUE";
            const isGrading =
              r.provider === "BX_AUTHENTICATION" && r.tier === "FULL_GRADING";
            const boxOf = r.batchId ? (batchSize.get(r.batchId) ?? 1) : 1;
            return (
              <div key={r.id} className="tnt-panel p-5 space-y-3">
                <div className="flex justify-between flex-wrap gap-2">
                  <Link
                    href={`/authenticate/${r.id}`}
                    className="text-ink font-medium"
                  >
                    {r.beanieName}
                  </Link>
                  <span className="text-yellow text-sm">
                    {r.status.replace(/_/g, " ")} ·{" "}
                    {formatCents(r.totalCents)}
                  </span>
                </div>
                <p className="text-muted text-sm">
                  <span
                    className={`tnt-badge ${isTrueBlue ? "text-cyan" : "text-[var(--tnt-red)]"} mr-2`}
                  >
                    {isTrueBlue
                      ? "True Blue"
                      : isGrading
                        ? "BX Full + Grading"
                        : "BX Basic"}
                  </span>
                  {authServiceLabel(r.serviceLevel, r.provider, r.tier)} ·{" "}
                  {r.user.name} · {r.condition ?? "no condition noted"}
                  {boxOf > 1 ? ` · one of ${boxOf} in the same box` : ""}
                </p>

                {r.status === "AWAITING_INBOUND" && (
                  <form
                    action={authReceiveAtCenter}
                    className="flex gap-2 flex-wrap items-end"
                  >
                    <input type="hidden" name="authRequestId" value={r.id} />
                    <input
                      className="tnt-input max-w-[150px]"
                      name="carrier"
                      placeholder="carrier"
                    />
                    <input
                      className="tnt-input max-w-[180px]"
                      name="trackingNumber"
                      placeholder="inbound tracking"
                    />
                    <button className="tnt-btn" type="submit">
                      Mark received at center
                    </button>
                    {boxOf > 1 && (
                      <span className="text-muted text-xs">
                        Receives all {boxOf} beanies in the box.
                      </span>
                    )}
                  </form>
                )}

                {(r.status === "AT_CENTER" || r.status === "IN_REVIEW") && (
                  <form action={authReview} className="space-y-2">
                    <input type="hidden" name="authRequestId" value={r.id} />
                    {isTrueBlue && (
                      <label className="block space-y-1">
                        <span className="text-cyan text-sm">
                          True Blue cert ID (required to pass)
                        </span>
                        <input
                          className="tnt-input"
                          name="trueBlueCertId"
                          placeholder="TBB-…"
                        />
                      </label>
                    )}
                    {isTrueBlue && (
                      <label className="block space-y-1">
                        <span className="text-cyan text-sm">
                          True Blue grade (required to pass)
                        </span>
                        <input
                          className="tnt-input"
                          name="grade"
                          placeholder="e.g. 9.5 / Gem Mint"
                        />
                      </label>
                    )}
                    {isGrading && (
                      <fieldset className="space-y-2">
                        <legend className="text-[var(--tnt-red)] text-sm">
                          5-point grade — score each 1–10 (overall is the
                          average)
                        </legend>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                          {[
                            { name: "score_swingTag", label: "Swing tag" },
                            { name: "score_tushTag", label: "Tush tag" },
                            { name: "score_fabric", label: "Fabric" },
                            { name: "score_fill", label: "Fill / shape" },
                            {
                              name: "score_cleanliness",
                              label: "Cleanliness",
                            },
                          ].map((c) => (
                            <label key={c.name} className="block space-y-1">
                              <span className="text-muted text-xs">
                                {c.label}
                              </span>
                              <input
                                className="tnt-input"
                                name={c.name}
                                type="number"
                                min={1}
                                max={10}
                                step={0.5}
                                placeholder="1–10"
                                required
                              />
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    )}
                    {!isTrueBlue && !isGrading && (
                      <p className="text-muted text-sm">
                        Basic authentication — no grade. Passing attaches a BX
                        tag, issues the COA + registry #, and marks the listing
                        BX Authenticated.
                      </p>
                    )}
                    <textarea
                      className="tnt-input"
                      name="notes"
                      rows={2}
                      placeholder={
                        isTrueBlue
                          ? "review notes"
                          : "in-house authentication notes (swing tag, tush tag, plush condition, examiner)"
                      }
                    />
                    <div className="flex gap-2">
                      <button
                        className="tnt-btn"
                        type="submit"
                        name="result"
                        value="PASS"
                      >
                        {isTrueBlue
                          ? "PASS — record True Blue + issue registry #"
                          : "PASS — issue BX cert + registry #"}
                      </button>
                      <button
                        className="tnt-btn tnt-btn--ghost"
                        type="submit"
                        formNoValidate
                        name="result"
                        value="FAIL"
                      >
                        FAIL
                      </button>
                    </div>
                  </form>
                )}

                {(r.status === "PASSED" || r.status === "FAILED") && (
                  <div className="space-y-2">
                    {r.bxCertId && (
                      <p className="text-green text-sm">
                        COA {r.bxCertId}
                        {r.grade ? ` · ${r.grade}` : ""}
                        {r.registrationNumber
                          ? ` · #${r.registrationNumber}`
                          : ""}
                      </p>
                    )}
                    <form
                      action={authRecordReturn}
                      className="flex gap-2 flex-wrap items-end"
                    >
                      <input
                        type="hidden"
                        name="authRequestId"
                        value={r.id}
                      />
                      <input
                        className="tnt-input max-w-[150px]"
                        name="carrier"
                        placeholder="carrier"
                      />
                      <input
                        className="tnt-input max-w-[180px]"
                        name="trackingNumber"
                        placeholder="return tracking"
                      />
                      <button className="tnt-btn" type="submit">
                        Record return shipment
                      </button>
                      <span className="text-muted text-xs">
                        {boxOf > 1
                          ? "Returns every reviewed beanie in the box under one label; leave the fields blank to buy it."
                          : "Leave the fields blank to buy the return label."}
                      </span>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
