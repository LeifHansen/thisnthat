"use client";

import { useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { toUploadable } from "@/components/PhotoUploader";
import { toast } from "@/lib/toast";

/**
 * Single profile-photo picker for the profile form. Uploads through
 * /api/upload (kind=avatar → no watermark, avatars/ key prefix) and emits the
 * resulting URL via a hidden `avatarUrl` input for the server action.
 */
export function AvatarUploader({
  initialUrl,
  fallbackName,
}: {
  initialUrl: string | null;
  fallbackName: string;
}) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function onPick(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append("kind", "avatar");
      body.append("file", await toUploadable(file));
      const res = await fetch("/api/upload", { method: "POST", body });
      const data = (await res.json().catch(() => null)) as
        | { urls?: string[]; error?: string }
        | null;
      if (!res.ok || !data?.urls?.[0]) {
        toast.error(data?.error ?? "Photo upload failed — try again");
        return;
      }
      setUrl(data.urls[0]);
      toast.success("Photo uploaded — save your profile to keep it");
    } catch {
      toast.error("Photo upload failed — try again");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar src={url || null} name={fallbackName} size={72} />
      <input type="hidden" name="avatarUrl" value={url} />
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="bx-btn bx-btn--ghost !py-2 !px-4 text-sm"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          {busy ? "Uploading…" : url ? "Change photo" : "Upload photo"}
        </button>
        {url && (
          <button
            type="button"
            className="text-sm font-semibold !text-[var(--bx-red)]"
            disabled={busy}
            onClick={() => setUrl("")}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
