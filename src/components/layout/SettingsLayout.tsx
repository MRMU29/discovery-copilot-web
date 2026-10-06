import { Suspense } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { PageSkeleton } from '@/components/common/states'
import { SETTINGS_LABELS, SETTINGS_NAV, SETTINGS_PATHS } from '@/app/nav'
import { useT } from '@/lib/i18n'

/** Settings chrome: side rail (privacy policy lives under About → 产品与文档), mobile scroll chips. */
export default function SettingsLayout() {
  const t = useT()
  const location = useLocation()
  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <nav aria-label={t('nav.sections')} className="md:w-56 md:shrink-0">
        <Link
          to="/"
          className="flex min-h-11 items-center rounded-btn px-2 text-body-sm text-ink-muted hover:text-ink"
        >
          ← {t('shell.backToProjects')}
        </Link>
        <h1 className="mt-2 text-headline text-ink">{t('shell.settings')}</h1>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-2 md:flex-col md:overflow-visible md:pb-0">
          {SETTINGS_NAV.map((key) => (
            <NavLink
              key={key}
              to={SETTINGS_PATHS[key]}
              className={({ isActive }) =>
                `flex min-h-11 shrink-0 items-center rounded-btn px-3 text-body-sm transition-colors ${
                  isActive ? 'bg-accent/15 text-ink' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                }`
              }
            >
              {t(SETTINGS_LABELS[key])}
            </NavLink>
          ))}
        </div>
      </nav>
      <div className="min-w-0 flex-1">
        <div key={location.pathname} className="dc-page-enter">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
