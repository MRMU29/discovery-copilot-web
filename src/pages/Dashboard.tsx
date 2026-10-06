import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { createProject, deleteProjectCascade, listActiveProjects, listDeletedProjects, restoreProject, softDeleteProject } from '@/services/projects'
import { SAMPLE_PROJECT_NAME, loadSampleProject } from '@/services/sample-project'
import { getOnboarding, markOnboardingDone } from '@/services/onboarding'
import { storageEstimate, type QuotaReport } from '@/db/quota'
import { RETENTION_MS } from '@/lib/limits'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/common/states'
import { FieldHint } from '@/components/onboarding/FieldHint'
import { projectPath } from '@/app/nav'
import { useT } from '@/lib/i18n'

const DAY_MS = 24 * 60 * 60 * 1000

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
  const onboarding = useLiveQuery(() => getOnboarding(), [])
  const hintsHighlighted = onboarding !== undefined && !onboarding.fieldHints

  const data = useLiveQuery(async () => {
    const [active, deleted] = await Promise.all([listActiveProjects(), listDeletedProjects()])
    const now = Date.now() // impure call kept out of render (react-hooks/purity)
    return {
      active,
      deleted: deleted.map((p) => ({
        ...p,
        daysLeft: Math.max(0, Math.ceil((Date.parse(p.deletedAt!) + RETENTION_MS - now) / DAY_MS)),
      })),
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
    const existing = data?.active.find((p) => p.name === SAMPLE_PROJECT_NAME)
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
    if (!window.confirm(t('dashboard.confirmSoftDelete'))) return
    setError(null)
    try {
      await softDeleteProject(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleHardDelete(id: string, name: string) {
    if (!window.confirm(t('dashboard.confirmHardDelete', { name }))) return
    setError(null)
    try {
      await deleteProjectCascade(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (data === undefined) return <PageSkeleton />

  const nameInput = (
    <input
      id="new-project-name"
      value={name}
      onChange={(e) => setName(e.target.value)}
      placeholder={t('dashboard.namePlaceholder')}
      maxLength={120}
      className="min-h-11 w-full rounded-btn border border-hairline-strong bg-surface-1 px-4 text-body text-ink placeholder:text-ink-faint focus:border-accent-focus focus:outline-none"
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
      className="w-full rounded-btn border border-hairline-strong bg-surface-1 px-4 py-2.5 text-body text-ink placeholder:text-ink-faint focus:border-accent-focus focus:outline-none"
    />
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-display-md text-ink">{t('dashboard.title')}</h1>
        <p className="mt-1 text-body text-ink-muted">
          {t('dashboard.subtitle')}
        </p>
      </div>

      {quota?.low && (
        <div role="status" className="rounded-lg border border-warning/40 bg-surface-1 px-4 py-3 text-body-sm text-ink">
          {t('dashboard.quotaLow', {
            used: quota.usage != null ? formatBytes(quota.usage) : t('settings.dataBackup.unknown'),
            quota: quota.quota != null ? formatBytes(quota.quota) : t('settings.dataBackup.unknown'),
          })}
        </div>
      )}

      <form
        onSubmit={handleCreate}
        className="space-y-3 rounded-lg border border-hairline bg-surface-1 p-4"
        aria-label={t('dashboard.formLabel')}
      >
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="new-project-name" className="text-caption text-ink-muted">
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="new-project-desc" className="text-caption text-ink-muted">
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
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!name.trim() || creating}>
            {creating ? t('dashboard.creating') : t('dashboard.create')}
          </Button>
          <Button variant="secondary" onClick={() => void handleLoadSample()} disabled={loadingSample}>
            {loadingSample ? t('dashboard.loadingSample') : t('dashboard.loadSample')}
          </Button>
        </div>
      </form>
      {error && <ErrorState message={error} />}

      {data.active.length === 0 ? (
        <EmptyState
          title={t('dashboard.emptyTitle')}
          description={t('dashboard.emptyDesc')}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.active.map((p) => (
            <li key={p.id} className="relative">
              <Link
                to={projectPath(p.id)}
                className="block rounded-lg border border-hairline bg-surface-1 p-4 pr-12 transition-colors hover:border-hairline-strong"
              >
                <p className="text-card-title text-ink">{p.name}</p>
                {p.description && <p className="mt-1 text-body-sm text-ink-muted">{p.description}</p>}
                <p className="mt-3 text-caption text-ink-faint">{t('dashboard.updatedAt', { date: p.updatedAt.slice(0, 10) })}</p>
              </Link>
              <button
                type="button"
                aria-label={t('dashboard.deleteAria', { name: p.name })}
                onClick={() => void handleSoftDelete(p.id)}
                className="absolute right-2 top-2 min-h-9 rounded-btn px-2 text-caption text-ink-faint hover:bg-danger/10 hover:text-danger"
              >
                {t('common.delete')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {data.deleted.length > 0 && (
        <section aria-label={t('dashboard.trash', { count: data.deleted.length })}>
          <h2 className="text-eyebrow text-ink-muted">{t('dashboard.trash', { count: data.deleted.length })}</h2>
          <ul className="mt-3 space-y-2">
            {data.deleted.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-surface-1 px-4 py-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-body-sm text-ink-secondary">
                  {p.name}
                  <span className="ml-2 text-caption text-ink-faint">{t('dashboard.daysLeft', { days: p.daysLeft })}</span>
                </span>
                <span className="flex shrink-0 gap-2">
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
    </div>
  )
}
