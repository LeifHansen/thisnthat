// Auth.js (NextAuth v5) configured with the Drizzle adapter on Neon.
//
// Auth is only enabled when the database and an auth secret are present.
// Until then the app runs in read-only "browse" mode against seed data.

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

export type UserRole = "user" | "admin" | "super_admin";

// The email that should always be a platform super admin.
export const SUPER_ADMIN_EMAIL =
  process.env.SUPER_ADMIN_EMAIL ?? "admin@thisnthat.com";

const providers = [];
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
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
  providers,
  pages: {
    signIn: "/login",
  },
  callbacks: {
    // Expose the platform role on the session so pages/components can gate on it.
    async session({ session, user }) {
      if (session.user && user) {
        (session.user as { role?: UserRole }).role =
          (user as { role?: UserRole }).role ?? "user";
      }
      return session;
    },
  },
  events: {
    // Ensure the configured super-admin email is always promoted on sign-in.
    async signIn({ user }) {
      if (db && user.email === SUPER_ADMIN_EMAIL && user.id) {
        await db
          .update(schema.users)
          .set({ role: "super_admin" })
          .where(eq(schema.users.id, user.id));
      }
    },
  },
});

export const isAuthConfigured =
  Boolean(db) && providers.length > 0 && Boolean(process.env.AUTH_SECRET);

// Whether the current request is from a platform super admin.
// In no-DB/no-auth dev mode this returns true so the admin area is viewable.
export async function isSuperAdmin(): Promise<boolean> {
  if (!isAuthConfigured) return true; // dev preview
  const session = await auth();
  return (session?.user as { role?: UserRole } | undefined)?.role === "super_admin";
}
