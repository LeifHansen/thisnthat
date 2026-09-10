"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

const KEYS = [
  "notifyOrders",
  "notifyOffers",
  "notifyMessages",
  "notifySocial",
  "notifyTips",
] as const;

/**
 * Save notification preferences from the token-based unsubscribe page. The
 * token identifies the user without a login (it arrives in email links), so
 * anyone with the link can only ever toggle their own prefs. An "all off"
 * submit clears every category; individual checkboxes set each one.
 */
export async function saveNotifyPrefsByToken(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return;

  const user = await prisma.user.findUnique({
    where: { unsubscribeToken: token },
    select: { id: true },
  });
  if (!user) redirect("/unsubscribe/invalid");

  const allOff = formData.get("intent") === "all-off";

  const data = Object.fromEntries(
    KEYS.map((k) => [k, allOff ? false : formData.get(k) === "on"]),
  );

  await prisma.user.update({ where: { id: user.id }, data });
  redirect(`/unsubscribe/${token}?saved=1`);
}
