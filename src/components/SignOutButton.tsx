import { signOut } from "@/lib/auth";

export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
    >
      <button
        type="submit"
        className="rounded-full border-2 border-[var(--bx-ink)] bg-[var(--bx-blue-bright)] !text-ink px-3.5 py-1.5 shadow-[0_2px_0_var(--bx-ink)] hover:-translate-y-0.5 transition-transform font-display font-bold cursor-pointer"
      >
        Sign out
      </button>
    </form>
  );
}
