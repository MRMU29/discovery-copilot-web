import { Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { purgeExpiredProjects } from '@/services/projects'
import { getSettings, updateSettings } from '@/services/settings'
import { getOnboarding } from '@/services/onboarding'
import { PageSkeleton } from '@/components/common/states'
import { WelcomeDialog } from '@/components/onboarding/WelcomeDialog'
import { SETTINGS_PATHS } from '@/app/nav'
import { applyThemePreference, useResolvedTheme } from '@/lib/theme'
import { CloseIcon, GridIcon, MenuIcon, MoonIcon, SettingsIcon, SunIcon } from '@/components/ui/icons'
import { setLocale, useT } from '@/lib/i18n'
import { BRAND_ICON_URL } from '@/lib/brand'

const navClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 items-center gap-3 rounded-btn px-3 text-body-sm transition-colors ${
    isActive
      ? 'bg-accent-soft font-semibold text-accent'
      : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
  }`

/** 抽屉里的导航项：当前路由（项目页归属工作台）保持高亮。 */
const drawerLinkClass = (active: boolean) =>
  `flex min-h-11 items-center gap-3 rounded-btn px-3 text-body transition-colors ${
    active
      ? 'bg-accent-soft font-semibold text-accent'
      : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
  }`

/**
 * Top-level chrome: desktop fixed left rail + content region; on narrow screens
 * a collapsible drawer replaces the rail and a compact top bar carries the
 * brand, theme toggle and settings shortcut. Mounting also runs the recycle-bin
 * sweep (§7.6: 30-day retention) once per session — idempotent. The welcome
 * tour is driven by the onboarding liveQuery.
 */
export default function AppShell() {
  const t = useT()
  const onboarding = useLiveQuery(() => getOnboarding(), [])
  const settings = useLiveQuery(() => getSettings(), [])
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

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

  // 顶栏/侧栏快捷切换：在浅/深之间直接翻转并持久化（恢复"跟随系统"在外观页）。
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

  // 路由变化时收起抽屉：渲染期同步状态，避免 effect 内 setState 触发级联渲染。
  const [lastPathname, setLastPathname] = useState(location.pathname)
  if (lastPathname !== location.pathname) {
    setLastPathname(location.pathname)
    setMenuOpen(false)
  }

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const showWelcome = onboarding !== undefined && !onboarding.welcome
  // 顶层路由段作为 key:跨页面导航(工作台/项目/设置)时内容区重放进入动画;
  // 项目内 section / 设置分区由各自的容器负责,避免上层组件被整棵重挂。
  const topSegment = location.pathname.split('/')[1]
  const themeIcon = resolvedTheme === 'light' ? <MoonIcon size={18} /> : <SunIcon size={18} />
  const themeLabel = resolvedTheme === 'light' ? t('shell.toggleToDark') : t('shell.toggleToLight')
  const onDashboard = location.pathname === '/' || location.pathname.startsWith('/project/')
  const inSettings = location.pathname.startsWith('/settings')

  return (
    <div className="dc-app-enter flex min-h-full">
      {/* 桌面固定左侧导航（≥768px 保持现状）：底色 + 1px 分隔，不用重投影 */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-hairline bg-surface-1 md:flex">
        <Link to="/" className="flex h-16 shrink-0 items-center gap-2.5 border-b border-hairline px-5">
          <img src={BRAND_ICON_URL} alt="" className="h-8 w-8 rounded-md" />
          <span className="text-subhead text-ink">Discovery Copilot</span>
        </Link>
        <nav aria-label={t('nav.sections')} className="flex flex-1 flex-col gap-1 p-3">
          <NavLink to="/" end className={navClass}>
            <GridIcon size={18} />
            {t('dashboard.title')}
          </NavLink>
          <NavLink to={SETTINGS_PATHS.aiProvider} className={navClass}>
            <SettingsIcon size={18} />
            {t('shell.settings')}
          </NavLink>
        </nav>
        <div className="border-t border-hairline p-3">
          <button
            type="button"
            onClick={() => void handleToggleTheme()}
            aria-label={themeLabel}
            className="flex min-h-11 w-full items-center gap-3 rounded-btn px-3 text-body-sm text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            {themeIcon}
            {themeLabel}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* 移动端顶栏：汉堡开抽屉 + 品牌 + 主题/设置快捷键；状态栏安全区见 dc-safe-top */}
        <header className="dc-safe-top sticky top-0 z-40 border-b border-hairline bg-canvas/85 backdrop-blur md:hidden">
          <div className="flex h-16 items-center gap-1 px-2">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={t('nav.sections')}
              aria-expanded={menuOpen}
              aria-controls="dc-mobile-drawer"
              className="flex size-11 shrink-0 items-center justify-center rounded-btn text-ink-secondary hover:bg-surface-2 hover:text-ink"
            >
              <MenuIcon size={22} />
            </button>
            <Link to="/" className="flex min-w-0 flex-1 items-center gap-2">
              <img src={BRAND_ICON_URL} alt="" className="h-7 w-7 shrink-0 rounded-md" />
              <span className="truncate text-body-sm font-semibold text-ink">Discovery Copilot</span>
            </Link>
            <button
              type="button"
              onClick={() => void handleToggleTheme()}
              aria-label={themeLabel}
              className="flex size-11 shrink-0 items-center justify-center rounded-btn text-ink-secondary hover:bg-surface-2 hover:text-ink"
            >
              {themeIcon}
            </button>
            <Link
              to={SETTINGS_PATHS.aiProvider}
              aria-label={t('shell.settings')}
              className="flex size-11 shrink-0 items-center justify-center rounded-btn text-ink-secondary hover:bg-surface-2 hover:text-ink"
            >
              <SettingsIcon size={20} />
            </Link>
          </div>
        </header>
        {!online && (
          <div
            role="status"
            className="border-b border-warning/30 bg-tint-yellow px-4 py-2 text-center text-caption text-ink"
          >
            {t('shell.offline')}
          </div>
        )}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-10">
          <div key={topSegment} className="dc-page-enter">
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
        {/* 底部安全区：内容流末尾让出 Home Indicator；桌面无安全区故隐藏 */}
        <div className="dc-safe-bottom md:hidden" aria-hidden="true" />
      </div>

      {/* 移动端抽屉：遮罩 + 左滑面板，当前路由高亮，Esc / 点遮罩 / 点链接收起 */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="dc-app-enter absolute inset-0 bg-scrim/55 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <aside
            id="dc-mobile-drawer"
            aria-label={t('nav.sections')}
            className="dc-drawer-panel absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col border-r border-hairline bg-surface-1 shadow-modal"
          >
            <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-hairline px-4">
              <Link to="/" className="flex min-w-0 items-center gap-2" onClick={() => setMenuOpen(false)}>
                <img src={BRAND_ICON_URL} alt="" className="h-8 w-8 shrink-0 rounded-md" />
                <span className="truncate text-body-sm font-semibold text-ink">Discovery Copilot</span>
              </Link>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label={t('common.close')}
                className="flex size-11 shrink-0 items-center justify-center rounded-btn text-ink-muted hover:bg-surface-2 hover:text-ink"
              >
                <CloseIcon size={20} />
              </button>
            </div>
            <nav aria-label={t('nav.sections')} className="flex flex-1 flex-col gap-1 p-3">
              <Link to="/" className={drawerLinkClass(onDashboard)} onClick={() => setMenuOpen(false)}>
                <GridIcon size={18} />
                {t('dashboard.title')}
              </Link>
              <Link
                to={SETTINGS_PATHS.aiProvider}
                className={drawerLinkClass(inSettings)}
                onClick={() => setMenuOpen(false)}
              >
                <SettingsIcon size={18} />
                {t('shell.settings')}
              </Link>
            </nav>
            <div className="border-t border-hairline p-3">
              <button
                type="button"
                onClick={() => void handleToggleTheme()}
                aria-label={themeLabel}
                className="flex min-h-11 w-full items-center gap-3 rounded-btn px-3 text-body-sm text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                {themeIcon}
                {themeLabel}
              </button>
            </div>
          </aside>
        </div>
      )}
      {showWelcome && <WelcomeDialog onClose={() => undefined} />}
    </div>
  )
}
