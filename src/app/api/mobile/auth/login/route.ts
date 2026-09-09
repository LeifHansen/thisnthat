import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rateLimit";
import { signMobileToken } from "@/lib/mobileAuth";

// Mobile sign-in: email + password → bearer token. Mirrors the web
// Credentials provider (bcrypt compare, suspended check) but returns a token
// the native app stores, instead of setting a session cookie.

// A valid bcrypt hash of a random string — compared against when the email is
// unknown so the request still spends bcrypt time (constant-time-ish login).
const DUMMY_HASH =
  "$2b$10$EKc7kutAkJFR7wqdXqivmOcwm9pU3U/5A1pWLLQrA.6pkU9RB664a";

export async function POST(req: Request) {
  const limited = rateLimit(req, "mobile-login", 10, 60_000);
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? "").toLowerCase().trim();
  const password = String(body?.password ?? "");
  if (!email || !password) {
    return NextResponse.json(
      { error: "Enter your email and password." },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // Always run a bcrypt compare — against the real hash, or a fixed dummy when
  // the email is unknown — so response timing can't distinguish registered vs.
  // unregistered emails (email enumeration). The dummy never matches a real
  // password, so an unknown email still fails.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    return NextResponse.json(
      { error: "Incorrect email or password." },
      { status: 401 },
    );
  }
  if (user.suspended) {
    return NextResponse.json(
      { error: "This account is suspended." },
      { status: 403 },
    );
  }

  const token = signMobileToken({ sub: user.id, email: user.email });
  return NextResponse.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      avatarUrl: user.avatarUrl,
    },
  });
}
