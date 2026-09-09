"use client";

import { setUserRole, setUserSuspended, deleteUser } from "../actions";

export function UserRowActions({
  id,
  name,
  role,
  suspended,
  isSelf,
  deletable,
}: {
  id: string;
  name: string;
  role: "USER" | "ADMIN";
  suspended: boolean;
  isSelf: boolean;
  deletable: boolean;
}) {
  if (isSelf) {
    return <span className="text-muted text-xs">superadmin (you)</span>;
  }

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <form action={setUserRole}>
        <input type="hidden" name="userId" value={id} />
        <input type="hidden" name="role" value={role === "ADMIN" ? "USER" : "ADMIN"} />
        <button className="tnt-btn tnt-btn--ghost !py-1 !px-2.5 !text-xs" type="submit">
          {role === "ADMIN" ? "Demote" : "Make admin"}
        </button>
      </form>

      <form action={setUserSuspended}>
        <input type="hidden" name="userId" value={id} />
        <input type="hidden" name="suspend" value={suspended ? "false" : "true"} />
        <button
          className={`tnt-btn !py-1 !px-2.5 !text-xs ${
            suspended ? "tnt-btn--green" : "tnt-btn--ghost"
          }`}
          type="submit"
        >
          {suspended ? "Reinstate" : "Suspend"}
        </button>
      </form>

      <form
        action={deleteUser}
        onSubmit={(e) => {
          if (
            !confirm(
              `Permanently delete ${name}? This can't be undone. Accounts with orders/listings are protected and can't be deleted — suspend those instead.`,
            )
          ) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="userId" value={id} />
        <button
          className="tnt-btn !py-1 !px-2.5 !text-xs !bg-[var(--tnt-red)] !text-white disabled:opacity-40"
          type="submit"
          disabled={!deletable}
          title={
            deletable
              ? "Delete account"
              : "Has marketplace history — suspend instead"
          }
        >
          Delete
        </button>
      </form>
    </div>
  );
}
