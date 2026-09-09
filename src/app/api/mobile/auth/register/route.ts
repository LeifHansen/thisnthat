import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { registerSchema, firstError } from "@/lib/validation";
import { rateLimit } from "@/lib/rateLimit";
import { signMobileToken } from "@/lib/mobileAuth";
import * as notify from "@/lib/notify";

// Mobile sign-up: creates the account (same validation + hashing as the web
// /api/register) and returns a bearer token so the app is signed in
// immediately. Address fields are optional here — collected later at checkout.

export async function POST(req: Request) {
  const limited = rateLimit(req, "mobile-register", 5, 60_000);
  if (limited) return limited;

  const json = await req.json().catch(() => ({}));
  const parsed = registerSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
  }
  const d = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email: d.email } });
  if (existing) {
    return NextResponse.json(
      { error: "That email is already registered." },
      { status: 409 },
    );
  }

  let user;
  try {
    user = await prisma.user.create({
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
    void notify.welcome(d.email, d.name).catch(() => {});
  } catch (e) {
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
