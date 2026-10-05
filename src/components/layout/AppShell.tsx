import { Suspense, useEffect, useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { purgeExpiredProjects } from '@/services/projects'
import { getOnboarding } from '@/services/onboarding'
import { PageSkeleton } from '@/components/common/states'
import { WelcomeDialog } from '@/components/onboarding/WelcomeDialog'
import { SETTINGS_PATHS } from '@/app/nav'
import { BRAND_ICON_URL } from '@/lib/brand'

/**
 * Top-level chrome: brand bar + lazy route outlet. Mounting also runs the
 * recycle-bin sweep (§7.6: 30-day retention) once per session — idempotent.
 * The welcome tour is driven by the onboarding liveQuery, so resetting the
 * guide from settings re-opens it immediately without a reload.
 */
export default function AppShell() {
  const onboarding = useLiveQuery(() => getOnboarding(), [])

  // 离线感知（纯本地 UI 提示）：AI 调用不可用，本地功能与数据不受影响。
  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true))

  useEffect(() => {
    const goOffline = () => setOnline(false)
    const goOnline = () => setOnline(true)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  useEffect(() => {
    void purgeExpiredProjects().catch(() => undefined)
  }, [])

  const showWelcome = onboarding !== undefined && !onboarding.welcome

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-50 border-b border-hairline bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 text-card-title text-ink">
            <img src={BRAND_ICON_URL} alt="" className="h-6 w-6 rounded-md" />
            Discovery Copilot
          </Link>
          <Link
            to={SETTINGS_PATHS.aiProvider}
            className="flex min-h-11 items-center rounded-btn px-3 text-body-sm text-ink-secondary hover:bg-surface-2 hover:text-ink"
          >
            设置
          </Link>
        </div>
      </header>
      {!online && (
        <div
          role="status"
          className="border-b border-warning/40 bg-warning/10 px-4 py-2 text-center text-caption text-ink"
        >
          当前设备离线：AI 调用不可用；本地功能与数据不受影响。
        </div>
      )}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </main>
      {showWelcome && <WelcomeDialog onClose={() => undefined} />}
    </div>
  )
}
