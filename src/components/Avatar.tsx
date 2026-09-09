import Image from "next/image";
import { avatarTint } from "@/lib/users";

/**
 * User avatar: uploaded photo when set, otherwise a deterministic colored
 * circle with the user's initial. Server-safe (no client hooks).
 */
export function Avatar({
  src,
  name,
  size = 40,
  className = "",
}: {
  src?: string | null;
  name: string;
  /** Rendered box in px (width = height). */
  size?: number;
  className?: string;
}) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  if (src) {
    return (
      <span
        className={`relative inline-block shrink-0 overflow-hidden rounded-full border-2 border-[var(--tnt-ink)] bg-white ${className}`}
        style={{ width: size, height: size }}
      >
        <Image
          src={src}
          alt={`${name} avatar`}
          fill
          sizes={`${size}px`}
          className="object-cover"
          unoptimized
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full border-2 border-[var(--tnt-ink)] font-bold text-white ${className}`}
      style={{ width: size, height: size, background: avatarTint(name), fontSize: size * 0.42 }}
    >
      {initial}
    </span>
  );
}
