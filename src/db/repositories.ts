import { db } from './db'
import type {
  Assumption,
  Experiment,
  OstNode,
  Project,
  Report,
  ScoreEvent,
  SettingsRow,
  Snapshot,
} from '@/schemas/entities'

/**
 * Pure per-table data access — no business rules here (plan §4.3 layering:
 * rules live in src/services, CRUD/queries live here). Return types are
 * inferred: Dexie's PromiseExtended carries the op's key/count and is
 * await-compatible, so annotating Promise<void> would fight the runtime.
 */

export const projectsRepo = {
  countAll() {
    return db.projects.count()
  },
  get(id: string) {
    return db.projects.get(id)
  },
  put(row: Project) {
    return db.projects.put(row)
  },
  delete(id: string) {
    return db.projects.delete(id)
  },
  all() {
    return db.projects.toArray()
  },
}

export const assumptionsRepo = {
  countByProject(projectId: string) {
    return db.assumptions.where('projectId').equals(projectId).count()
  },
  get(id: string) {
    return db.assumptions.get(id)
  },
  put(row: Assumption) {
    return db.assumptions.put(row)
  },
  delete(id: string) {
    return db.assumptions.delete(id)
  },
  byProject(projectId: string) {
    return db.assumptions.where('projectId').equals(projectId).toArray()
  },
  /** Bulk unlink: experiment.assumptionId → null (referential cleanup on assumption delete). */
  unlinkAssumption(assumptionId: string) {
    return db.experiments.where('assumptionId').equals(assumptionId).modify({ assumptionId: null })
  },
}

export const experimentsRepo = {
  countByProject(projectId: string) {
    return db.experiments.where('projectId').equals(projectId).count()
  },
  get(id: string) {
    return db.experiments.get(id)
  },
  put(row: Experiment) {
    return db.experiments.put(row)
  },
  delete(id: string) {
    return db.experiments.delete(id)
  },
  byProject(projectId: string) {
    return db.experiments.where('projectId').equals(projectId).toArray()
  },
  byAssumption(assumptionId: string) {
    return db.experiments.where('assumptionId').equals(assumptionId).toArray()
  },
}

export const ostRepo = {
  countByProject(projectId: string) {
    return db.ost_nodes.where('projectId').equals(projectId).count()
  },
  get(id: string) {
    return db.ost_nodes.get(id)
  },
  put(row: OstNode) {
    return db.ost_nodes.put(row)
  },
  childrenOf(projectId: string, parentId: string) {
    return db.ost_nodes
      .where('parentId')
      .equals(parentId)
      .and((n) => n.projectId === projectId)
      .toArray()
  },
  delete(ids: string[]) {
    return db.ost_nodes.bulkDelete(ids)
  },
  byProject(projectId: string) {
    return db.ost_nodes.where('projectId').equals(projectId).toArray()
  },
  unlinkAssumption(assumptionId: string) {
    return db.ost_nodes
      .where('linkedAssumptionId')
      .equals(assumptionId)
      .modify({ linkedAssumptionId: null })
  },
  unlinkExperiment(experimentId: string) {
    return db.ost_nodes
      .where('linkedExperimentId')
      .equals(experimentId)
      .modify({ linkedExperimentId: null })
  },
}

export const reportsRepo = {
  countByProject(projectId: string) {
    return db.reports.where('projectId').equals(projectId).count()
  },
  get(id: string) {
    return db.reports.get(id)
  },
  put(row: Report) {
    return db.reports.put(row)
  },
  delete(id: string) {
    return db.reports.delete(id)
  },
  byProject(projectId: string) {
    return db.reports.where('projectId').equals(projectId).toArray()
  },
}

export const scoreEventsRepo = {
  async add(event: ScoreEvent) {
    await db.score_events.add(event)
  },
  byAssumption(assumptionId: string) {
    return db.score_events.where('assumptionId').equals(assumptionId).toArray()
  },
  deleteByAssumption(assumptionId: string) {
    return db.score_events.where('assumptionId').equals(assumptionId).delete()
  },
}

export const settingsRepo = {
  get(key: string) {
    return db.settings.get(key)
  },
  put(row: SettingsRow) {
    return db.settings.put(row)
  },
}

/** §7.6 local snapshots (pre-overwrite-import safety net, latest 3 kept). */
export const snapshotsRepo = {
  put(row: Snapshot) {
    return db.snapshots.put(row)
  },
  list(limit = 10) {
    return db.snapshots.orderBy('createdAt').reverse().limit(limit).toArray()
  },
  delete(id: string) {
    return db.snapshots.delete(id)
  },
  async prune(keep = 3): Promise<void> {
    const rows = await db.snapshots.orderBy('createdAt').reverse().toArray()
    const doomed = rows.slice(keep).map((r) => r.id)
    if (doomed.length > 0) await db.snapshots.bulkDelete(doomed)
  },
}

/** Cascades one project's child rows. Caller owns the transaction. */
export async function deleteProjectChildren(projectId: string): Promise<void> {
  await Promise.all([
    db.assumptions.where('projectId').equals(projectId).delete(),
    db.experiments.where('projectId').equals(projectId).delete(),
    db.ost_nodes.where('projectId').equals(projectId).delete(),
    db.reports.where('projectId').equals(projectId).delete(),
    db.score_events.where('projectId').equals(projectId).delete(),
  ])
}
