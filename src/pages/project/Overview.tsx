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

  const primaryCta = (href: string, label: string) => (
    <Link
      to={href}
      className="inline-flex min-h-11 max-w-full items-center justify-center break-words rounded-btn bg-accent px-4 py-2.5 text-center text-button text-white shadow-xs hover:bg-accent-hover"
    >
      {label}
    </Link>
  )

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            to={s.href}
            className="rounded-lg border border-hairline bg-surface-1 p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-hairline-strong hover:shadow-pop sm:p-5"
          >
            <p className="text-eyebrow text-ink-muted">{s.label}</p>
            <p className="mt-2 text-headline tabular-nums text-ink sm:text-display-md">{s.value}</p>
          </Link>
        ))}
      </div>

      {counts.assumptions === 0 ? (
        <EmptyState
          title={t('overview.start.title')}
          description={t('overview.start.desc')}
          action={primaryCta(projectPath(projectId, 'assumptions'), t('overview.start.cta'))}
        />
      ) : counts.experiments === 0 ? (
        <EmptyState
          title={t('overview.exp.title')}
          description={t('overview.exp.desc')}
          action={primaryCta(projectPath(projectId, 'experiments'), t('overview.exp.cta'))}
        />
      ) : counts.ost === 0 ? (
        <EmptyState
          title={t('overview.ost.title')}
          description={t('overview.ost.desc')}
          action={primaryCta(projectPath(projectId, 'ost'), t('overview.ost.cta'))}
        />
      ) : (
        <EmptyState
          title={t('overview.done.title')}
          description={t('overview.done.desc')}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {primaryCta(projectPath(projectId, 'report'), t('overview.done.ctaReport'))}
              <Link
                to={projectPath(projectId, 'experiments')}
                className="inline-flex min-h-11 max-w-full items-center justify-center break-words rounded-btn border border-hairline bg-surface-1 px-4 py-2.5 text-center text-button text-ink shadow-xs hover:border-hairline-strong hover:bg-surface-2"
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
