/** Declared capacity ceilings of the local-first architecture (plan §5.4). Enforced in services. */
export const CAPS = {
  /** Local project total, recycle bin included (plan §5.4: ≤ 50). */
  projects: 50,
  /** Per project. */
  assumptions: 200,
  ostNodes: 300,
  experiments: 100,
  reports: 20,
} as const

/** Recycle-bin retention before purge (plan §7.6: 30 days). */
export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000
