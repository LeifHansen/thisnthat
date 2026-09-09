import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { safeInternalPath } from "@/lib/nextRedirect";

export const metadata: Metadata = {
  title: "Sign in to Beanie Xchange",
  robots: { index: false, follow: false },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; registered?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const next = safeInternalPath(sp.next);

  async function doSignIn(formData: FormData) {
    "use server";
    // Carry the intended destination through the form so "sign in to
    // continue" flows land back where the user was, not on the dashboard.
    const dest = safeInternalPath(String(formData.get("next") ?? "")) ?? "/dashboard";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirect: false,
      });
    } catch {
      redirect(
        `/auth/signin?error=1${dest !== "/dashboard" ? `&next=${encodeURIComponent(dest)}` : ""}`,
      );
    }
    redirect(dest);
  }

  return (
    <div className="max-w-md mx-auto bx-panel p-6 space-y-4">
      <h1 className="text-2xl">Sign in</h1>
      {sp.registered && (
        <p className="text-[var(--bx-success)] text-sm font-semibold">
          Account created — sign in below.
        </p>
      )}
      {sp.error && (
        <p className="text-red-600 text-sm">Invalid email or password.</p>
      )}
      <form action={doSignIn} className="space-y-3">
        {next && <input type="hidden" name="next" value={next} />}
        <input
          className="bx-input"
          name="email"
          type="email"
          placeholder="email"
          required
        />
        <input
          className="bx-input"
          name="password"
          type="password"
          placeholder="password"
          required
        />
        <button className="bx-btn w-full" type="submit">
          Sign In
        </button>
      </form>
      <p className="text-sm">
        No account?{" "}
        <Link
          href="/auth/signup"
          className="!text-[var(--bx-green)] font-semibold"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}
