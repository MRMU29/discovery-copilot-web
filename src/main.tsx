// First import: sets <html data-theme> from the cached resolution before any
// stylesheet applies (see src/lib/theme.ts). Keep it above tokens.css.
import '@/lib/theme-init'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/tokens.css'
import App from '@/app/App'

// GitHub Pages SPA fallback (see public/404.html): a deep link first lands
// on the 404 page, which stashes the original path; restore it before the
// router initializes. No-op on every other host.
try {
  const redirectTarget = sessionStorage.getItem('dc-redirect')
  if (redirectTarget) {
    sessionStorage.removeItem('dc-redirect')
    history.replaceState(null, '', redirectTarget)
  }
} catch {
  // sessionStorage unavailable (private mode) — deep links just 404 on GH Pages
}

// 启动页生命周期：静态启动页（index.html）在首帧即全覆盖并自行播放 CSS
// 动画；这里决定去留——本会话已播过或用户偏好减动效时立即移除，否则等
// 动画播完（1s 进场 + 0.25s 淡出）后写会话标记再移除。
const splash = document.getElementById('dc-splash')
if (splash) {
  let played = false
  try {
    played = sessionStorage.getItem('dcopilot.splash.played') === '1'
  } catch {
    // private mode — treat as not yet played
  }
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  if (played || reducedMotion) {
    splash.remove()
  } else {
    window.setTimeout(() => {
      try {
        sessionStorage.setItem('dcopilot.splash.played', '1')
      } catch {
        // private mode — splash will replay next load, acceptable
      }
      splash.remove()
    }, 1250)
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
