import { Suspense, useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { purgeExpiredProjects } from '@/services/projects'
import { getSettings, updateSettings } from '@/services/settings'
import { getOnboarding } from '@/services/onboarding'
import { PageSkeleton } from '@/components/common/states'
import { WelcomeDialog } from '@/components/onboarding/WelcomeDialog'
import { SETTINGS_PATHS } from '@/app/nav'
import { applyThemePreference, useResolvedTheme } from '@/lib/theme'
import { MoonIcon, SunIcon } from '@/components/ui/icons'
import { setLocale, useT } from '@/lib/i18n'
import { BRAND_ICON_URL } from '@/lib/brand'

/**
 * Top-level chrome: brand bar + lazy route outlet. Mounting also runs the
 * recycle-bin sweep (§7.6: 30-day retention) once per session — idempotent.
 * The welcome tour is driven by the onboarding liveQuery, so resetting the
 * guide from settings re-opens it immediately without a reload.
 */
export default function AppShell() {
  const t = useT()
  const onboarding = useLiveQuery(() => getOnboarding(), [])
  const settings = useLiveQuery(() => getSettings(), [])
  const location = useLocation()

  // Theme: settings row is authoritative; until it loads, mirror the pre-paint
  // resolution (theme-init) by applying 'system'.
  const themePref = settings?.theme ?? 'system'
  useEffect(() => applyThemePreference(themePref), [themePref])
  const resolvedTheme = useResolvedTheme(themePref)

  // Locale: same liveQuery drives the i18n store; until settings load, stay zh-Hans.
  const language = settings?.language ?? 'zh-Hans'
  useEffect(() => {
    setLocale(language)
  }, [language])

  // 顶栏快捷切换：在浅/深之间直接翻转并持久化（恢复"跟随系统"在外观页）。
  async function handleToggleTheme() {
    try {
      await updateSettings({ theme: resolvedTheme === 'dark' ? 'light' : 'dark' })
    } catch {
      // best-effort affordance — the appearance page remains the source of truth
    }
  }

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
  // 顶层路由段作为 key:跨页面导航(工作台/项目/设置)时内容区重放进入动画;
  // 项目内 section / 设置分区由各自的容器负责,避免上层组件被整棵重挂。
  const topSegment = location.pathname.split('/')[1]

  return (
    <div className="dc-app-enter flex min-h-full flex-col">
      <header className="sticky top-0 z-50 border-b border-hairline bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 text-card-title text-ink">
            <img src={BRAND_ICON_URL} alt="" className="h-6 w-6 rounded-md" />
            Discovery Copilot
          </Link>
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void handleToggleTheme()}
              aria-label={resolvedTheme === 'light' ? t('shell.toggleToDark') : t('shell.toggleToLight')}
              className="flex min-h-11 items-center rounded-btn px-3 text-ink-secondary transition-colors hover:bg-surface-2 hover:text-ink"
            >
              {resolvedTheme === 'light' ? <MoonIcon size={18} /> : <SunIcon size={18} />}
            </button>
            <Link
              to={SETTINGS_PATHS.aiProvider}
              className="flex min-h-11 items-center rounded-btn px-3 text-body-sm text-ink-secondary hover:bg-surface-2 hover:text-ink"
            >
              {t('shell.settings')}
            </Link>
          </span>
        </div>
      </header>
      {!online && (
        <div
          role="status"
          className="border-b border-warning/40 bg-warning/10 px-4 py-2 text-center text-caption text-ink"
        >
          {t('shell.offline')}
        </div>
      )}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <div key={topSegment} className="dc-page-enter">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
      {showWelcome && <WelcomeDialog onClose={() => undefined} />}
    </div>
  )
}
