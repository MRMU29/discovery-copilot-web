import { Suspense, lazy } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { projectsRepo } from '@/db/repositories'
import { ErrorState, PageSkeleton, Skeleton } from '@/components/common/states'
import { PROJECT_SECTIONS, SECTION_LABELS, projectPath, resolveSection, type ProjectSection } from '@/app/nav'
import { useT } from '@/lib/i18n'

const Overview = lazy(() => import('@/pages/project/Overview'))
const Assumptions = lazy(() => import('@/pages/project/Assumptions'))
const Experiments = lazy(() => import('@/pages/project/Experiments'))
const Ost = lazy(() => import('@/pages/project/Ost'))
const Report = lazy(() => import('@/pages/project/Report'))

const SECTION_COMPONENTS: Record<ProjectSection, React.LazyExoticComponent<React.ComponentType<{ projectId: string }>>> = {
  overview: Overview,
  assumptions: Assumptions,
  experiments: Experiments,
  ost: Ost,
  report: Report,
}

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 items-center rounded-btn px-3 text-body-sm transition-colors ${
    isActive ? 'bg-accent/15 text-ink' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
  }`

/**
 * Project workspace: header + 5 flat sections (§3.1). Desktop renders a top
 * rail; mobile renders a fixed bottom tab bar with safe-area padding. An
 * unknown :section falls back to overview content in place — no redirect.
 */
export default function ProjectPage() {
  const t = useT()
  const { projectId, section } = useParams()
  const data = useLiveQuery(async () => {
    const project = projectId ? await projectsRepo.get(projectId) : undefined
    return { project: project ?? null }
  }, [projectId])

  if (data === undefined) {
    return (
      <div>
        <Skeleton className="h-8 w-64" />
        <div className="mt-6">
          <PageSkeleton />
        </div>
      </div>
    )
  }
  if (!data.project || !projectId) {
    return (
      <div className="space-y-4">
        <ErrorState title={t('shell.projectNotFound')} message={t('shell.projectNotFoundDesc')} />
        <Link to="/" className="inline-flex min-h-11 items-center text-body-sm text-accent hover:text-accent-hover">
          ← 返回项目列表
        </Link>
      </div>
    )
  }

  const active = resolveSection(section)
  const Section = SECTION_COMPONENTS[active]

  return (
    <div className="pb-24 md:pb-8">
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="flex min-h-11 items-center rounded-btn px-2 text-body-sm text-ink-muted hover:text-ink"
          aria-label={t('shell.backToProjects')}
        >
          ←
        </Link>
        <h1 className="text-headline text-ink">{data.project.name}</h1>
      </div>

      {/* Desktop rail */}
      <nav aria-label={t('nav.sections')} className="mt-4 hidden gap-1 md:flex">
        {PROJECT_SECTIONS.map((s) => (
          <NavLink key={s} to={projectPath(projectId, s)} className={tabClass}>
            {t(SECTION_LABELS[s])}
          </NavLink>
        ))}
      </nav>

      <div className="mt-6">
        <div key={active} className="dc-page-enter">
          <Suspense fallback={<PageSkeleton />}>
            <Section projectId={projectId} />
          </Suspense>
        </div>
      </div>

      {/* Mobile bottom tab bar — 安卓优先 */}
      <nav
        aria-label={t('nav.sections')}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-surface-1/95 backdrop-blur md:hidden"
      >
        <div className="mx-auto grid max-w-6xl grid-cols-5 pb-[max(env(safe-area-inset-bottom),0.375rem)] pt-1">
          {PROJECT_SECTIONS.map((s) => (
            <NavLink
              key={s}
              to={projectPath(projectId, s)}
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${
                  isActive ? 'text-accent' : 'text-ink-muted'
                }`
              }
            >
              {t(SECTION_LABELS[s])}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
