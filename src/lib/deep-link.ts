/**
 * Deep-link restore helper (see main.tsx). Some static hosts stash the original
 * path in sessionStorage before serving index.html. That value is attacker-
 * controllable in a shared-link scenario, so only an absolute same-origin path
 * is accepted: `//evil.example` and `https://…` are protocol-relative/absolute
 * and would turn the restore into an open redirect.
 */
export function safeStashTarget(raw: string | null | undefined): string | null {
  if (!raw) return null
  if (!raw.startsWith('/')) return null
  if (raw.startsWith('//')) return null
  // Backslash variants are normalized to "/" by some browsers ("/\\evil.example").
  if (raw.startsWith('/\\')) return null
  return raw
}
