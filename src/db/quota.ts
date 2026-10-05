/**
 * Storage quota visibility + persistence request (plan §5.4 / §7.6).
 * Android Chrome is aggressive about evicting site data under storage pressure,
 * so requestPersistent() is a first-class data-protection feature, not a nicety.
 * The storage handle is injectable for tests; production resolves
 * navigator.storage and degrades silently when the API is unavailable.
 */
export const QUOTA_WARN_BYTES = 50 * 1024 * 1024

export interface StorageEstimateLike {
  usage?: number
  quota?: number
}

export interface StorageManagerLike {
  estimate?: () => Promise<StorageEstimateLike>
  persist?: () => Promise<boolean>
}

export interface QuotaReport {
  usage: number | null
  quota: number | null
  /** true when (quota − usage) is below the 50 MB warning line (§5.4). */
  low: boolean
}

function resolveStorage(handle?: StorageManagerLike): StorageManagerLike | null {
  if (handle) return handle
  const nav = typeof navigator !== 'undefined' ? (navigator as { storage?: StorageManagerLike }) : undefined
  return nav?.storage ?? null
}

export async function storageEstimate(handle?: StorageManagerLike): Promise<QuotaReport> {
  const storage = resolveStorage(handle)
  if (!storage?.estimate) return { usage: null, quota: null, low: false }
  const estimate = await storage.estimate()
  const usage = estimate.usage ?? null
  const quota = estimate.quota ?? null
  const free = quota != null && usage != null ? quota - usage : null
  return { usage, quota, low: free != null && free < QUOTA_WARN_BYTES }
}

export async function requestPersistent(handle?: StorageManagerLike): Promise<boolean> {
  const storage = resolveStorage(handle)
  if (!storage?.persist) return false
  return storage.persist()
}
