import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  createProject,
  deleteProjectCascade,
  listActiveProjects,
  listDeletedProjects,
  renameProject,
  restoreProject,
  setProjectArchived,
  softDeleteProject,
} from '@/services/projects'
import { SAMPLE_PROJECT_NAME, loadSampleProject } from '@/services/sample-project'
import { getOnboarding, markOnboardingDone } from '@/services/onboarding'
import { getSettings } from '@/services/settings'
import { storageEstimate, type QuotaReport } from '@/db/quota'
import { RETENTION_MS } from '@/lib/limits'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/common/states'
import { FieldHint } from '@/components/onboarding/FieldHint'
import { projectPath } from '@/app/nav'
import { confirmAction } from '@/lib/confirm'
import { useT } from '@/lib/i18n'
import type { Project } from '@/schemas/entities'

const DAY_MS = 24 * 60 * 60 * 1000
/** Nudge when the only copy has not been exported for this long. */
const BACKUP_REMINDER_DAYS = 30

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function Dashboard() {
  const t = useT()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [loadingSample, setLoadingSample] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quota, setQuota] = useState<QuotaReport | null>(null)
  const [renameTarget, setRenameTarget] = useState<Project | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renaming, setRenaming] = useState(false)
  const onboarding = useLiveQuery(() => getOnboarding(), [])
  const hintsHighlighted = onboarding !== undefined && !onboarding.fieldHints

  const data = useLiveQuery(async () => {
    const [projects, deleted, settings] = await Promise.all([
      listActiveProjects(),
      listDeletedProjects(),
      getSettings(),
    ])
    const now = Date.now() // impure call kept out of render (react-hooks/purity)
    return {
      // Archived projects are a reversible filter, so they are split here and
      // never removed from the DB (all their assumptions/OST stay queryable).
      active: projects.filter((p) => p.status !== 'archived'),
      archived: projects.filter((p) => p.status === 'archived'),
      deleted: deleted.map((p) => ({
        ...p,
        daysLeft: Math.max(0, Math.ceil((Date.parse(p.deletedAt!) + RETENTION_MS - now) / DAY_MS)),
      })),
      // Age is derived here (not in render) so the reminder stays pure.
      backupAgeDays: settings.lastBackupAt
        ? Math.floor((now - Date.parse(settings.lastBackupAt)) / DAY_MS)
        : null,
    }
  }, [])

  useEffect(() => {
    let alive = true
    storageEstimate()
      .then((q) => {
        if (alive) setQuota(q)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || creating) return
    setCreating(true)
    setError(null)
    try {
      const project = await createProject({ name: trimmed, description: description.trim() })
      void markOnboardingDone('fieldHints').catch(() => undefined)
      setName('')
      setDescription('')
      navigate(projectPath(project.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }

  async function handleLoadSample() {
    if (loadingSample) return
    // 已有示例项目时直接跳过去，不再重复创建（避免堆积多个同名示例）。
    const existing = [...(data?.active ?? []), ...(data?.archived ?? [])].find(
      (p) => p.name === SAMPLE_PROJECT_NAME,
    )
    if (existing) {
      navigate(projectPath(existing.id))
      return
    }
    setLoadingSample(true)
    setError(null)
    try {
      const refs = await loadSampleProject()
      navigate(projectPath(refs.project.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingSample(false)
    }
  }

  async function handleSoftDelete(id: string) {
    if (!(await confirmAction({ title: t('confirm.confirmTitle'), body: t('dashboard.confirmSoftDelete') }))) return
    setError(null)
    try {
      await softDeleteProject(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleHardDelete(id: string, name: string) {
    if (!(await confirmAction({ title: t('confirm.deleteTitle'), body: t('dashboard.confirmHardDelete', { name }), tone: 'danger' }))) return
    setError(null)
    try {
      await deleteProjectCascade(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function openRename(project: Project) {
    setError(null)
    setRenameTarget(project)
    setRenameValue(project.name)
  }

  async function handleRename(event: React.FormEvent) {
    event.preventDefault()
    const target = renameTarget
    const trimmed = renameValue.trim()
    if (!target || !trimmed || renaming) return
    setRenaming(true)
    setError(null)
    try {
      await renameProject(target.id, trimmed)
      setRenameTarget(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRenaming(false)
    }
  }

  async function handleArchive(project: Project, archived: boolean) {
    setError(null)
    try {
      await setProjectArchived(project.id, archived)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (data === undefined) return <PageSkeleton />

  const totalProjects = data.active.length + data.archived.length
  const showBackupReminder =
    totalProjects > 0 &&
    (data.backupAgeDays === null || data.backupAgeDays >= BACKUP_REMINDER_DAYS)

  const nameInput = (
    <input
      id="new-project-name"
      value={name}
      onChange={(e) => setName(e.target.value)}
      placeholder={t('dashboard.namePlaceholder')}
      maxLength={120}
      className="min-h-11 w-full max-w-full rounded-btn border border-hairline-strong bg-surface-2/50 px-4 text-body text-ink placeholder:text-ink-faint focus:border-accent-focus focus:outline-none focus:ring-2 focus:ring-accent-focus/30"
    />
  )
  const descriptionInput = (
    <textarea
      id="new-project-desc"
      value={description}
      onChange={(e) => setDescription(e.target.value)}
      rows={3}
      maxLength={2000}
      placeholder={t('dashboard.descPlaceholder')}
      className="w-full max-w-full rounded-btn border border-hairline-strong bg-surface-2/50 px-4 py-2.5 text-body text-ink placeholder:text-ink-faint focus:border-accent-focus focus:outline-none focus:ring-2 focus:ring-accent-focus/30"
    />
  )

  return (
    <div className="space-y-8 sm:space-y-10">
      <header>
        <p className="text-eyebrow text-accent">DISCOVERY COPILOT</p>
        <h1 className="mt-2 text-headline text-ink sm:text-display-md">{t('dashboard.title')}</h1>
        <p className="mt-2 max-w-2xl text-body text-ink-muted sm:text-body-lg">{t('dashboard.subtitle')}</p>
      </header>

      {quota?.low && (
        <div role="status" className="rounded-lg border border-warning/30 bg-tint-yellow px-5 py-3 text-body-sm text-ink">
          {t('dashboard.quotaLow', {
            used: quota.usage != null ? formatBytes(quota.usage) : t('settings.dataBackup.unknown'),
            quota: quota.quota != null ? formatBytes(quota.quota) : t('settings.dataBackup.unknown'),
          })}
        </div>
      )}

      <form
        onSubmit={handleCreate}
        className="space-y-4 rounded-lg border border-hairline bg-surface-1 p-4 shadow-card sm:space-y-5 sm:p-6"
        aria-label={t('dashboard.formLabel')}
      >
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="new-project-name" className="text-body-sm font-semibold text-ink-secondary">
              {t('dashboard.nameLabel')}
            </label>
            <FieldHint
              field={t('dashboard.nameField')}
              highlighted={hintsHighlighted}
              onRead={() => void markOnboardingDone('fieldHints').catch(() => undefined)}
              good={t('dashboard.hintNameGood')}
              bad={t('dashboard.hintNameBad')}
            />
          </div>
          {nameInput}
        </div>
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="new-project-desc" className="text-body-sm font-semibold text-ink-secondary">
              {t('dashboard.descLabel')}
            </label>
            <FieldHint
              field={t('dashboard.descField')}
              highlighted={hintsHighlighted}
              onRead={() => void markOnboardingDone('fieldHints').catch(() => undefined)}
              good="面向一二线城市、月宠物支出 500 元以上的养猫家庭（谁）；想喂鲜食但没时间做（问题）；期望每周 30 分钟搞定一周喂食（期望结果）。"
              bad="做一个改变宠物行业的伟大产品。"
            />
          </div>
          {descriptionInput}
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="submit" disabled={!name.trim() || creating}>
            {creating ? t('dashboard.creating') : t('dashboard.create')}
          </Button>
          <Button variant="secondary" onClick={() => void handleLoadSample()} disabled={loadingSample}>
            {loadingSample ? t('dashboard.loadingSample') : t('dashboard.loadSample')}
          </Button>
        </div>
      </form>
      {error && <ErrorState message={error} />}

      {/*
        Backup health (§7.3): the browser holds the only copy, so a stale (or
        missing) export deserves a nudge that the previous UI never gave.
      */}
      {showBackupReminder && (
        <section
          aria-label={t('dashboard.backupHeading')}
          className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-surface-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-body-sm text-ink-secondary">
            {data.backupAgeDays === null
              ? t('dashboard.backupNever')
              : t('dashboard.backupStale', { days: data.backupAgeDays })}
          </p>
          <Link
            to="/settings/data-backup"
            className="min-h-11 shrink-0 rounded-btn border border-hairline px-3 py-2 text-center text-caption text-ink hover:border-hairline-strong"
          >
            {t('dashboard.backupCta')}
          </Link>
        </section>
      )}

      {data.active.length === 0 && data.archived.length === 0 ? (
        <EmptyState
          title={t('dashboard.emptyTitle')}
          description={t('dashboard.emptyDesc')}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.active.map((p) => (
            <li key={p.id} className="flex flex-col">
              <div className="flex h-full flex-col rounded-lg border border-hairline bg-surface-1 shadow-card transition-all hover:-translate-y-0.5 hover:border-hairline-strong hover:shadow-pop">
                <Link to={projectPath(p.id)} className="block flex-1 p-4 sm:p-5">
                  <p className="text-subhead text-ink sm:text-card-title">{p.name}</p>
                  {p.description && <p className="mt-1.5 line-clamp-2 text-body-sm text-ink-muted">{p.description}</p>}
                  <p className="mt-4 text-caption text-ink-faint">{t('dashboard.updatedAt', { date: p.updatedAt.slice(0, 10) })}</p>
                </Link>
                {/*
                  Actions live in their own row (not as an overlay) so each one
                  keeps a 44px target and a name for screen readers, and so the
                  row still fits a 375px card.
                */}
                <div className="flex flex-wrap items-center justify-end gap-1 border-t border-hairline px-2 py-1">
                  <button
                    type="button"
                    aria-label={t('dashboard.renameAria', { name: p.name })}
                    onClick={() => openRename(p)}
                    className="min-h-11 rounded-btn px-2.5 text-caption text-ink-faint hover:bg-surface-2 hover:text-ink"
                  >
                    {t('dashboard.rename')}
                  </button>
                  <button
                    type="button"
                    aria-label={t('dashboard.archiveAria', { name: p.name })}
                    onClick={() => void handleArchive(p, true)}
                    className="min-h-11 rounded-btn px-2.5 text-caption text-ink-faint hover:bg-surface-2 hover:text-ink"
                  >
                    {t('dashboard.archive')}
                  </button>
                  <button
                    type="button"
                    aria-label={t('dashboard.deleteAria', { name: p.name })}
                    onClick={() => void handleSoftDelete(p.id)}
                    className="min-h-11 rounded-btn px-2.5 text-caption text-ink-faint hover:bg-danger/10 hover:text-danger"
                  >
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data.archived.length > 0 && (
        <details className="rounded-lg border border-hairline bg-surface-1 px-4 py-3">
          <summary className="min-h-11 cursor-pointer text-eyebrow text-ink-muted">
            {t('dashboard.archivedHeading', { count: data.archived.length })}
          </summary>
          <p className="mt-1 text-caption text-ink-faint">{t('dashboard.archivedNote')}</p>
          <ul className="mt-3 space-y-2">
            {data.archived.map((p) => (
              <li
                key={p.id}
                className="flex flex-col items-start gap-2 rounded-lg border border-hairline bg-surface-2/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <Link to={projectPath(p.id)} className="min-w-0 flex-1 text-body-sm text-ink-secondary hover:text-ink">
                  {p.name}
                  <span className="ml-2 text-caption text-ink-faint">
                    {t('dashboard.updatedAt', { date: p.updatedAt.slice(0, 10) })}
                  </span>
                </Link>
                <Button
                  variant="secondary"
                  aria-label={t('dashboard.unarchiveAria', { name: p.name })}
                  onClick={() => void handleArchive(p, false)}
                >
                  {t('dashboard.unarchive')}
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {data.deleted.length > 0 && (
        <section aria-label={t('dashboard.trash', { count: data.deleted.length })}>
          <h2 className="text-eyebrow text-ink-muted">{t('dashboard.trash', { count: data.deleted.length })}</h2>
          <ul className="mt-3 space-y-2">
            {data.deleted.map((p) => (
              <li
                key={p.id}
                className="flex flex-col items-start gap-2 rounded-lg border border-hairline bg-surface-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="min-w-0 flex-1 text-body-sm text-ink-secondary">
                  {p.name}
                  <span className="ml-2 text-caption text-ink-faint">{t('dashboard.daysLeft', { days: p.daysLeft })}</span>
                </span>
                <span className="flex min-w-0 flex-wrap justify-end gap-2">
                  <Button variant="secondary" onClick={() => void restoreProject(p.id)}>
                    {t('dashboard.restore')}
                  </Button>
                  <Button variant="danger" onClick={() => void handleHardDelete(p.id, p.name)}>
                    {t('dashboard.deleteForever')}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Dialog
        open={renameTarget !== null}
        title={t('dashboard.renameTitle')}
        onClose={() => setRenameTarget(null)}
      >
        <form onSubmit={handleRename} className="space-y-3">
          <div>
            <label htmlFor="rename-project-name" className="text-caption text-ink-muted">
              {t('dashboard.nameLabel')}
            </label>
            <input
              id="rename-project-name"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              maxLength={120}
              className="mt-1 min-h-11 w-full rounded-btn border border-hairline-strong bg-surface-1 px-3 py-2 text-body text-ink focus:border-accent-focus focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!renameValue.trim() || renaming}>
              {renaming ? t('common.saving') : t('common.save')}
            </Button>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
