import { db } from '@/db/db'
import { projectsRepo } from '@/db/repositories'
import { nowIso } from '@/lib/clock'
import { DomainError } from '@/lib/errors'
import { translate } from '@/lib/i18n'
import { fileNameSlug } from '@/lib/report-export'
import { getSettings } from '../settings'
import { DCOPILT_FORMAT, DCOPILT_FORMAT_VERSION, dcopilotFileSchema, type DcopilotFile } from './schema'

/**
 * Builds the file for ALL projects (backup) or one project (AC-08 both
 * scopes). Rows are read raw and re-validated by dcopilotFileSchema so the
 * written file is always schema-clean.
 */
export async function buildDcopilotFile(scope: 'all' | string): Promise<DcopilotFile> {
  const allProjects = await projectsRepo.all()
  const projects = scope === 'all' ? allProjects : allProjects.filter((p) => p.id === scope)
  if (scope !== 'all' && projects.length === 0) {
    throw new DomainError('NOT_FOUND', translate('backup.projectNotFound', { id: scope }))
  }
  const ids = new Set(projects.map((p) => p.id))
  const [assumptions, experiments, ostNodes, reports, decisions, settings] = await Promise.all([
    db.assumptions.toArray(),
    db.experiments.toArray(),
    db.ost_nodes.toArray(),
    db.reports.toArray(),
    db.decisions.toArray(),
    getSettings(),
  ])
  return dcopilotFileSchema.parse({
    format: DCOPILT_FORMAT,
    formatVersion: DCOPILT_FORMAT_VERSION,
    appVersion: __APP_VERSION__,
    exportedAt: nowIso(),
    projects,
    assumptions: assumptions.filter((a) => ids.has(a.projectId)),
    experiments: experiments.filter((e) => ids.has(e.projectId)),
    ostNodes: ostNodes.filter((n) => ids.has(n.projectId)),
    reports: reports.filter((r) => ids.has(r.projectId)),
    decisions: decisions.filter((d) => ids.has(d.projectId)),
    // Backup age is device-local: exporting it would make a restored file claim a
    // freshness it does not have.
    settings: settings ? { ...settings, lastBackupAt: null } : null,
  })
}

/** `名称-YYYYMMDD.dcopilot`（日期便于多份备份并存于下载目录）。 */
export function dcopilotFileName(name: string): string {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  return `${fileNameSlug(name, 'backup')}-${stamp}.dcopilot`
}
