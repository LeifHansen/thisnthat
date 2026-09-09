/**
 * Public display identity. `displayName` is the user-chosen handle shown
 * everywhere public; `name` (the signup name) is the fallback so existing
 * accounts render exactly as before.
 */
export function displayNameOf(u: {
  displayName?: string | null;
  name: string;
}): string {
  return u.displayName?.trim() || u.name;
}

/** Deterministic avatar tint for users without a photo. */
const AVATAR_TINTS = [
  "var(--bx-red)",
  "var(--bx-blue)",
  "var(--bx-green)",
  "var(--bx-purple)",
  "var(--bx-pink)",
  "#b7791f",
];

export function avatarTint(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_TINTS[Math.abs(h) % AVATAR_TINTS.length];
}
