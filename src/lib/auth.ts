import { cache } from "react";
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { consumeHandoffToken } from "@/lib/mobileAuth";

// Compared against when the email is unknown so login timing doesn't reveal
// whether an email is registered (a real bcrypt hash of a random string).
const DUMMY_HASH =
  "$2b$10$EKc7kutAkJFR7wqdXqivmOcwm9pU3U/5A1pWLLQrA.6pkU9RB664a";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "USER" | "ADMIN";
    } & DefaultSession["user"];
  }
}

const nextAuth = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/auth/signin" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        const email = String(creds?.email ?? "").toLowerCase().trim();
        const password = String(creds?.password ?? "");
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        // Always run a compare (dummy hash when the email is unknown) so timing
        // can't distinguish registered vs. unregistered emails.
        const ok = await bcrypt.compare(
          password,
          user?.passwordHash ?? DUMMY_HASH,
        );
        if (!user || !ok) return null;

        // Suspended accounts cannot sign in.
        if (user.suspended) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),

    // Sign-in by hand-off token, for the mobile app only.
    //
    // The app authenticates with a bearer token, but the in-app browser it
    // opens for the screens that are still web (dashboard, messages) is a
    // SFSafariViewController with its own cookie jar and no knowledge of that
    // token — so tapping through used to land the user on the site signed out.
    // /api/mobile/handoff mints a single-use 90s token and the app opens
    // /auth/handoff with it, which redeems it here for a normal cookie
    // session.
    //
    // This is not a password bypass: consumeHandoffToken only accepts a
    // token this server signed with purpose "handoff", which is only ever
    // issued to a caller that already proved itself with a valid API bearer
    // token, and it can be redeemed exactly once.
    Credentials({
      id: "mobile-handoff",
      name: "Beanie Xchange app",
      credentials: { token: { label: "Hand-off token", type: "text" } },
      async authorize(creds) {
        const claims = consumeHandoffToken(String(creds?.token ?? ""));
        if (!claims) return null;

        const user = await prisma.user.findUnique({ where: { id: claims.sub } });
        if (!user || user.suspended) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as { id: string }).id;
        token.role = (user as { role: "USER" | "ADMIN" }).role;
        return token;
      }
      // On every subsequent request, re-read role AND suspended from the
      // database so that granting/revoking ADMIN or suspending an account takes
      // effect immediately — without forcing the user to sign out and back in.
      if (token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { role: true, suspended: true },
        });
        if (dbUser) {
          token.role = dbUser.role;
          token.suspended = dbUser.suspended;
        } else {
          // The account no longer exists (a throw, not null, is what a DB
          // outage produces here). Fail closed: mark it suspended so the
          // session callback below strips the user, instead of leaving a
          // deleted account signed in on its old claims until the JWT expires.
          token.suspended = true;
        }
      }
      return token;
    },
    async session({ session, token }) {
      // A user suspended mid-session: strip the user so every auth() consumer
      // treats them as logged out. JWT sessions can't be revoked server-side,
      // so this DB-backed check on each request is the enforcement point.
      if (token.suspended) {
        return { ...session, user: undefined } as unknown as typeof session;
      }
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as "USER" | "ADMIN") ?? "USER";
      }
      return session;
    },
  },
});

export const { handlers, signIn, signOut } = nextAuth;

/**
 * Session for the current request, memoized per request.
 *
 * The jwt callback above re-reads role + suspended from the database on EVERY
 * call — that's what makes a role change or suspension take effect instantly —
 * but auth() is called ~45 times across layout, page, and action code, and a
 * single render can easily hit it several times. React's cache() collapses
 * those into one session read per request while keeping the freshness.
 *
 * Only the zero-argument form is used in this codebase (never as a route
 * wrapper), so a single cache entry per request is exactly right.
 */
export const auth = cache(nextAuth.auth);
