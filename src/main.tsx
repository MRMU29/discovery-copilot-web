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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
