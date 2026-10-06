import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { assumptionsRepo, experimentsRepo, ostRepo, reportsRepo } from '@/db/repositories'
import { EmptyState, PageSkeleton } from '@/components/common/states'
import { projectPath } from '@/app/nav'
import { useT } from '@/lib/i18n'

export default function Overview({ projectId }: { projectId: string }) {
  const t = useT()
  const counts = useLiveQuery(
    async () => ({
      assumptions: await assumptionsRepo.countByProject(projectId),
      experiments: await experimentsRepo.countByProject(projectId),
      ost: await ostRepo.countByProject(projectId),
      reports: await reportsRepo.countByProject(projectId),
    }),
    [projectId],
  )

  if (counts === undefined) return <PageSkeleton />

  const stats = [
    { label: t('overview.stat.assumptions'), value: counts.assumptions, href: projectPath(projectId, 'assumptions') },
    { label: t('overview.stat.experiments'), value: counts.experiments, href: projectPath(projectId, 'experiments') },
    { label: t('overview.stat.ost'), value: counts.ost, href: projectPath(projectId, 'ost') },
    { label: t('overview.stat.reports'), value: counts.reports, href: projectPath(projectId, 'report') },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            to={s.href}
            className="rounded-lg border border-hairline bg-surface-1 p-4 transition-colors hover:border-hairline-strong"
          >
            <p className="text-caption text-ink-muted">{s.label}</p>
            <p className="mt-1 text-display-md text-ink">{s.value}</p>
          </Link>
        ))}
      </div>

      {counts.assumptions === 0 ? (
        <EmptyState
          title={t('overview.start.title')}
          description={t('overview.start.desc')}
          action={
            <Link
              to={projectPath(projectId, 'assumptions')}
              className="inline-flex min-h-11 items-center rounded-btn bg-accent px-4 py-2.5 text-button text-white"
            >
              {t('overview.start.cta')}
            </Link>
          }
        />
      ) : counts.experiments === 0 ? (
        <EmptyState
          title={t('overview.exp.title')}
          description={t('overview.exp.desc')}
          action={
            <Link
              to={projectPath(projectId, 'experiments')}
              className="inline-flex min-h-11 items-center rounded-btn bg-accent px-4 py-2.5 text-button text-white"
            >
              {t('overview.exp.cta')}
            </Link>
          }
        />
      ) : counts.ost === 0 ? (
        <EmptyState
          title={t('overview.ost.title')}
          description={t('overview.ost.desc')}
          action={
            <Link
              to={projectPath(projectId, 'ost')}
              className="inline-flex min-h-11 items-center rounded-btn bg-accent px-4 py-2.5 text-button text-white"
            >
              {t('overview.ost.cta')}
            </Link>
          }
        />
      ) : (
        <EmptyState
          title={t('overview.done.title')}
          description={t('overview.done.desc')}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link
                to={projectPath(projectId, 'report')}
                className="inline-flex min-h-11 items-center rounded-btn bg-accent px-4 py-2.5 text-button text-white"
              >
                {t('overview.done.ctaReport')}
              </Link>
              <Link
                to={projectPath(projectId, 'experiments')}
                className="inline-flex min-h-11 items-center rounded-btn border border-hairline-strong bg-surface-2 px-4 py-2.5 text-button text-ink hover:bg-surface-3"
              >
                {t('overview.done.ctaExperiments')}
              </Link>
            </div>
          }
        />
      )}
    </div>
  )
}
