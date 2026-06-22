// Auth.js (NextAuth v5) — multi-tenant authentication.
//
// Providers:
//   - Google OAuth (production), enabled when AUTH_GOOGLE_ID/SECRET are set
//   - a passwordless "dev" email login for local testing, enabled by
//     ALLOW_DEV_LOGIN=true (never enable in production)
//
// Sessions use the JWT strategy (works with both providers); the Drizzle
// adapter persists users/accounts in Postgres. User id and platform role are
// attached to the token/session so the app can gate on them.

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

export type UserRole = "user" | "admin" | "super_admin";

export const SUPER_ADMIN_EMAIL =
  process.env.SUPER_ADMIN_EMAIL ?? "admin@thisnthat.com";

const devLoginEnabled = process.env.ALLOW_DEV_LOGIN === "true";
const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

// Get-or-create a user by email and return it (used by the dev provider).
async function upsertUser(email: string) {
  if (!db) return null;
  const role: UserRole = email === SUPER_ADMIN_EMAIL ? "super_admin" : "user";
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (existing) {
    if (role === "super_admin" && existing.role !== "super_admin") {
      await db.update(schema.users).set({ role }).where(eq(schema.users.id, existing.id));
      return { ...existing, role };
    }
    return existing;
  }
  const [created] = await db
    .insert(schema.users)
    .values({ email, name: email.split("@")[0], role })
    .returning();
  return created;
}

const providers = [];
if (googleEnabled) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  );
}
if (devLoginEnabled) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev email login",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(creds) {
        const email = String(creds?.email ?? "").trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
        const user = await upsertUser(email);
        if (!user) return null;
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  );
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: db
    ? DrizzleAdapter(db, {
        usersTable: schema.users,
        accountsTable: schema.accounts,
        sessionsTable: schema.sessions,
        verificationTokensTable: schema.verificationTokens,
      })
    : undefined,
  session: { strategy: "jwt" },
  providers,
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as { id?: string }).id;
        token.role = (user as { role?: UserRole }).role ?? "user";
      }
      // The configured super admin email is always super_admin.
      if (token.email === SUPER_ADMIN_EMAIL) token.role = "super_admin";
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string | undefined;
        (session.user as { role?: UserRole }).role = (token.role as UserRole) ?? "user";
      }
      return session;
    },
  },
});

export const isAuthConfigured =
  Boolean(db) && providers.length > 0 && Boolean(process.env.AUTH_SECRET);

export const isGoogleEnabled = googleEnabled;
export const isDevLoginEnabled = devLoginEnabled;

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
}

// The signed-in user, or null. Reads the JWT session.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (!isAuthConfigured) return null;
  const session = await auth();
  const u = session?.user as
    | { id?: string; email?: string | null; name?: string | null; role?: UserRole }
    | undefined;
  if (!u?.email || !u.id) return null;
  return { id: u.id, email: u.email, name: u.name ?? null, role: u.role ?? "user" };
}

// Whether the current request is from a platform super admin.
// In no-auth dev mode this returns true so the admin area stays viewable.
export async function isSuperAdmin(): Promise<boolean> {
  if (!isAuthConfigured) return true;
  const user = await getCurrentUser();
  return user?.role === "super_admin";
}
