import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { signIn } from "@/lib/auth";
import { registerSchema, firstError } from "@/lib/validation";
import { rateLimit } from "@/lib/rateLimit";
import * as notify from "@/lib/notify";

/**
 * Prisma's connection-level failures: the database was unreachable, timed out,
 * or the client could not initialise (missing/invalid DATABASE_URL). None of
 * them mean the submitted details were bad, and none of them created a row —
 * so they are reported as a retryable 503 rather than lumped in with a bug in
 * this handler.
 */
const UNREACHABLE_DB_CODES = new Set([
  "P1000", // authentication against the database server failed
  "P1001", // can't reach database server
  "P1002", // server reached but timed out
  "P1008", // operation timed out
  "P1017", // server has closed the connection
]);

function isDbUnreachable(e: unknown): boolean {
  // PrismaClientKnownRequestError carries `code`; the initialisation error
  // (thrown when the URL is missing or unparseable) carries `errorCode`.
  const code =
    (e as { code?: string })?.code ?? (e as { errorCode?: string })?.errorCode;
  return typeof code === "string" && UNREACHABLE_DB_CODES.has(code);
}

/**
 * One retry for those connection-level failures. A serverless Postgres (Neon,
 * which is what production points at) suspends when idle, and the query that
 * wakes it can fail while the next one lands fine — which a new visitor would
 * otherwise experience as "registration failed" on a perfectly healthy site.
 *
 * Reads only, deliberately: replaying a write after an ambiguous connection
 * drop risks inserting the account twice, and the second insert would come
 * back as "that email is already registered" — against the account the caller
 * had just created.
 */
async function retryRead<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (e) {
    if (!isDbUnreachable(e)) throw e;
    await new Promise((r) => setTimeout(r, 250));
    return op();
  }
}

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

  // Everything below talks to the database or to Auth.js. An exception escaping
  // here used to become Next's HTML 500 page, which the signup wizard can't
  // parse — so every server-side fault, transient or not, reached the visitor
  // as the same "please try again in a minute" and was logged nowhere with
  // enough context to tell those faults apart. Answer with JSON always, and say
  // in the log which account attempt it was.
  try {
    const existing = await retryRead(() =>
      prisma.user.findUnique({ where: { email: d.email } }),
    );
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
      console.error("[register] auto sign-in failed", e);
    }

    return NextResponse.json({ ok: true, signedIn });
  } catch (e) {
    if (isDbUnreachable(e)) {
      console.error("[register] database unreachable:", e);
      return NextResponse.json(
        {
          error:
            "We couldn't reach our database just now — no account was created. Please try again in a minute.",
        },
        { status: 503 },
      );
    }
    console.error("[register] failed:", e);
    return NextResponse.json(
      {
        error:
          "Something went wrong on our end and your account wasn't created. Please try again, and contact support if it keeps happening.",
      },
      { status: 500 },
    );
  }
}
