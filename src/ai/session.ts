/**
 * Session-only key store (§6.3): keys live in module memory and die with the
 * page. Persisting a key (localStorage / IndexedDB / .dcopilot) is deliberately
 * NOT supported — a long-lived plaintext credential is not worth the
 * convenience of not re-typing it. Keys never enter Dexie, backups,
 * diagnostics, URLs or logs.
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
