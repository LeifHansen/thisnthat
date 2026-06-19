// Auth.js (NextAuth v5) configured with the Drizzle adapter on Neon.
//
// Auth is only enabled when the database and an auth secret are present.
// Until then the app runs in read-only "browse" mode against seed data.

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db, schema } from "@/db";

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
});

export const isAuthConfigured =
  Boolean(db) && providers.length > 0 && Boolean(process.env.AUTH_SECRET);
