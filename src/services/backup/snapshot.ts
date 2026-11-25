import { snapshotsRepo } from '@/db/repositories'
import { nowIso } from '@/lib/clock'
import { snapshotSchema, type Snapshot } from '@/schemas/entities'
import { buildDcopilotFile } from './export'

/**
 * §7.6 snapshot: a full .dcopilot file stored locally before any destructive
 * import. Payload is the same format, so a snapshot can be re-imported by hand
 * if the UI path ever breaks.
 */
export interface SnapshotResult {
  snapshot: Snapshot
  /** Ids of snapshots dropped by the count/byte budget (empty on the first three). */
  pruned: string[]
}

export async function createSnapshot(): Promise<SnapshotResult> {
  const file = await buildDcopilotFile('all')
  const row = snapshotSchema.parse({
    id: crypto.randomUUID(),
    createdAt: nowIso(),
    payload: JSON.stringify(file),
    projectCount: file.projects.length,
    appVersion: file.appVersion,
  })
  await snapshotsRepo.put(row)
  const pruned = await snapshotsRepo.prune()
  return { snapshot: row, pruned }
}
