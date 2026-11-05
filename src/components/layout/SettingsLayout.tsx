import { Suspense } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { PageSkeleton } from '@/components/common/states'
import { SETTINGS_LABELS, SETTINGS_NAV, SETTINGS_PATHS } from '@/app/nav'
import { useT } from '@/lib/i18n'

/** Settings chrome: horizontal section tabs (global navigation lives in AppShell's left rail / mobile drawer). */
export default function SettingsLayout() {
  const t = useT()
  const location = useLocation()
  return (
    <div className="space-y-6 sm:space-y-8">
      <header>
        <Link
          to="/"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-btn px-2 text-body-sm text-ink-muted transition-colors hover:text-ink"
        >
          ← {t('shell.backToProjects')}
        </Link>
        <h1 className="mt-2 text-headline text-ink sm:text-display-md">{t('shell.settings')}</h1>
      </header>

      {/* 窄屏横向滚动（细滚动条 + 惯性），宽屏自然铺开；当前分区下划线高亮 */}
      <nav
        aria-label={t('nav.sections')}
        className="dc-scroll-x flex gap-1 overflow-x-auto border-b border-hairline"
      >
        {SETTINGS_NAV.map((key) => (
          <NavLink
            key={key}
            to={SETTINGS_PATHS[key]}
            className={({ isActive }) =>
              `flex min-h-11 shrink-0 items-center border-b-2 px-3 text-body-sm transition-colors sm:px-4 ${
                isActive
                  ? 'border-accent font-semibold text-accent'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`
            }
          >
            {t(SETTINGS_LABELS[key])}
          </NavLink>
        ))}
      </nav>

      <div className="min-w-0">
        <div key={location.pathname} className="dc-page-enter">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
