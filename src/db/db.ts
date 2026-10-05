import Dexie, { type Table } from 'dexie'
import type {
  AiRequest,
  Assumption,
  Experiment,
  OstNode,
  Project,
  ProviderConfigRow,
  Report,
  ScoreEvent,
  SettingsRow,
  Snapshot,
} from '@/schemas/entities'

/**
 * Local-first single source of truth (plan §4.3). Writes go through the service
 * layer only — components must never call db.put directly.
 *
 * Timestamps are ISO strings so rows survive .dcopilot JSON round-trips untouched.
 * `deletedAt` is intentionally NOT indexed: IndexedDB does not index null keys, and
 * the recycle-bin query is a ≤50-row filter. Future index changes: add
 * version(2).stores({...}).upgrade(tx => ...) — never mutate version(1). Field-level
 * tolerance for pre-existing rows missing optional fields is handled by zod defaults
 * in the service read paths; the .dcopilot file-format migration chain lives in
 * command 10's import machinery.
 */
export class DiscoveryDb extends Dexie {
  projects!: Table<Project, string>
  assumptions!: Table<Assumption, string>
  experiments!: Table<Experiment, string>
  ost_nodes!: Table<OstNode, string>
  reports!: Table<Report, string>
  score_events!: Table<ScoreEvent, number>
  settings!: Table<SettingsRow, string>
  ai_requests!: Table<AiRequest, number>
  ai_providers!: Table<ProviderConfigRow, string>
  snapshots!: Table<Snapshot, string>

  constructor() {
    super('discovery-copilot')
    this.version(1).stores({
      projects: 'id, status, updatedAt',
      assumptions: 'id, projectId, status, [projectId+type], [projectId+status]',
      experiments: 'id, projectId, assumptionId, [projectId+status]',
      ost_nodes: 'id, projectId, parentId, linkedAssumptionId, linkedExperimentId',
      reports: 'id, projectId, createdAt',
      score_events: '++seq, assumptionId, projectId',
      settings: 'key',
    })
    // Command 4: AI usage ledger (§6.4). Local-only — never exported with .dcopilot.
    this.version(2).stores({
      ai_requests: '++id, providerId, projectId, createdAt, status',
    })
    // Command 5: provider configs (§6.1, non-secret; keys stay session-only).
    this.version(3).stores({
      ai_providers: 'id, kind, createdAt',
    })
    // Command 10: pre-overwrite-import local snapshots (§7.6, keep latest 3).
    this.version(4).stores({
      snapshots: 'id, createdAt',
    })
  }
}

export const db = new DiscoveryDb()

/**
 * Wipe and reopen. Dexie 4 does NOT auto-reopen an instance after close()/delete()
 * (verified by probe: fresh instances auto-open on first op, but a closed/deleted
 * one stays closed until open() is called explicitly) — so tests reset through here.
 */
export async function resetDb(): Promise<void> {
  await db.delete()
  await db.open()
}

export async function closeDb(): Promise<void> {
  db.close()
}
