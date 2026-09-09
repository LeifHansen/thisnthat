import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { signIn } from "@/lib/auth";
import { registerSchema, firstError } from "@/lib/validation";
import { rateLimit } from "@/lib/rateLimit";
import * as notify from "@/lib/notify";

export async function POST(req: Request) {
  const limited = rateLimit(req, "register", 5, 60_000);
  if (limited) return limited;

  const json = await req.json().catch(() => ({}));
  const parsed = registerSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: firstError(parsed.error) },
      { status: 400 },
    );
  }
  const d = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email: d.email } });
  if (existing) {
    return NextResponse.json(
      { error: "That email is already registered." },
      { status: 409 },
    );
  }

  try {
    await prisma.user.create({
      data: {
        name: d.name,
        email: d.email,
        passwordHash: await bcrypt.hash(d.password, 10),
        role: "USER",
        addressLine1: d.addressLine1,
        addressLine2: d.addressLine2,
        city: d.city,
        state: d.state,
        postalCode: d.postalCode,
        country: "US",
      },
    });
    // fire-and-forget welcome email; swallow rejections so they don't surface
    // as unhandled promise rejections.
    void notify.welcome(d.email, d.name).catch(() => {});
  } catch (e) {
    // The unique constraint on email is the source of truth: two concurrent
    // registrations can both pass the check above, and the loser lands here.
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      (e as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "That email is already registered." },
        { status: 409 },
      );
    }
    throw e;
  }

  // Start the session right here so a new account lands on the dashboard
  // instead of being bounced to /auth/signin to retype what it just typed.
  // next-auth writes the session cookie through next/headers, which a route
  // handler is allowed to do — it rides out on this response. `redirect:
  // false` because the client owns the navigation. If this fails the account
  // still exists, so tell the client and let it fall back to the sign-in page.
  let signedIn = false;
  try {
    await signIn("credentials", {
      email: d.email,
      password: d.password,
      redirect: false,
    });
    signedIn = true;
  } catch (e) {
    console.error("register: auto sign-in failed", e);
  }

  return NextResponse.json({ ok: true, signedIn });
}
