import { Suspense } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { PageSkeleton } from '@/components/common/states'
import { SETTINGS_LABELS, SETTINGS_PATHS } from '@/app/nav'

const entries = Object.entries(SETTINGS_PATHS) as [keyof typeof SETTINGS_PATHS, string][]

/** Settings chrome: 4 flat sub-pages (§3.1). Desktop side rail, mobile scroll chips. */
export default function SettingsLayout() {
  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <nav aria-label="设置分区" className="md:w-56 md:shrink-0">
        <Link
          to="/"
          className="flex min-h-11 items-center rounded-btn px-2 text-body-sm text-ink-muted hover:text-ink"
        >
          ← 返回项目列表
        </Link>
        <h1 className="mt-2 text-headline text-ink">设置</h1>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-2 md:flex-col md:overflow-visible md:pb-0">
          {entries.map(([key, path]) => (
            <NavLink
              key={key}
              to={path}
              className={({ isActive }) =>
                `flex min-h-11 shrink-0 items-center rounded-btn px-3 text-body-sm transition-colors ${
                  isActive ? 'bg-accent/15 text-ink' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                }`
              }
            >
              {SETTINGS_LABELS[key]}
            </NavLink>
          ))}
        </div>
      </nav>
      <div className="min-w-0 flex-1">
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  )
}
