/**
 * Session-only key store (§6.3): keys live in module memory and die with the
 * page. The optional "remember key" feature is deliberately NOT implemented
 * yet — when it lands it must be user-opt-in and stored separately from
 * project data, never in Dexie, never in .dcopilot.
 */

const keys = new Map<string, string>()

export function setSessionKey(providerId: string, key: string): void {
  keys.set(providerId, key)
}

export function getSessionKey(providerId: string): string | null {
  return keys.get(providerId) ?? null
}

export function hasSessionKey(providerId: string): boolean {
  return keys.has(providerId)
}

export function clearSessionKeys(): void {
  keys.clear()
}

export function deleteSessionKey(providerId: string): void {
  keys.delete(providerId)
}
