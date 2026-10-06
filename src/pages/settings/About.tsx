import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { ChevronRightIcon } from '@/components/ui/icons'
import { Dialog } from '@/components/ui/Dialog'
import { useT } from '@/lib/i18n'
import { downloadFile } from '@/lib/download'
import { resetOnboarding } from '@/services/onboarding'
import { resetApp } from '@/services/maintenance'
import { buildDiagnosticReport, diagnosticsFileName, type DiagnosticReport } from '@/services/diagnostics'

const DOC_LINKS = [
  { to: '/settings/product', titleKey: 'settings.about.docProduct', descKey: 'settings.about.docProductDesc' },
  { to: '/settings/privacy', titleKey: 'settings.about.docPrivacy', descKey: 'settings.about.docPrivacyDesc' },
  { to: '/settings/terms', titleKey: 'settings.about.docTerms', descKey: 'settings.about.docTermsDesc' },
] as const

export default function About() {
  const t = useT()
  const navigate = useNavigate()
  const [resetting, setResetting] = useState(false)
  const [wiping, setWiping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [diagPending, setDiagPending] = useState<DiagnosticReport | null>(null)
  const [diagBusy, setDiagBusy] = useState(false)

  async function handleReplayOnboarding() {
    setResetting(true)
    setError(null)
    try {
      await resetOnboarding()
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setResetting(false)
    }
  }

  async function handlePreviewDiagnostics() {
    setDiagBusy(true)
    setError(null)
    try {
      setDiagPending(await buildDiagnosticReport())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDiagBusy(false)
    }
  }

  function handleExportDiagnostics(report: DiagnosticReport) {
    downloadFile(diagnosticsFileName(), JSON.stringify(report, null, 2), 'application/json')
    setDiagPending(null)
  }

  async function handleResetApp() {
    if (!window.confirm(t('settings.about.resetConfirm1'))) return
    if (!window.confirm(t('settings.about.resetConfirm2'))) return
    setWiping(true)
    setError(null)
    try {
      await resetApp()
      // 不走 navigate：resetApp 已关闭数据库连接并删除整个库，立即整页重载
      // 让浏览器归还存储配额、以全新状态重新挂载应用。
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setWiping(false)
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-headline text-ink">{t('settings.about.title')}</h2>
      <div className="rounded-lg border border-hairline bg-surface-1 p-6">
        <p className="text-card-title text-ink">Discovery Copilot</p>
        <p className="mt-1 text-body-sm text-ink-muted">{t('settings.about.versionLine', { version: __APP_VERSION__ })}</p>
        <dl className="mt-4 space-y-1 text-body-sm text-ink-secondary">
          <div>
            <dt className="inline text-ink-faint">{t('settings.about.stackLabel')}</dt>
            <dd className="inline"> {t('settings.about.stack')}</dd>
          </div>
          <div>
            <dt className="inline text-ink-faint">{t('settings.about.buildLabel')}</dt>
            <dd className="inline"> {t('settings.about.build')}</dd>
          </div>
        </dl>
      </div>

      <section aria-label={t('settings.about.onboardingTitle')} className="rounded-lg border border-hairline bg-surface-1 p-6">
        <p className="text-card-title text-ink">{t('settings.about.onboardingTitle')}</p>
        <p className="mt-1 text-body-sm text-ink-muted">{t('settings.about.onboardingDesc')}</p>
        <Button className="mt-3" variant="secondary" onClick={() => void handleReplayOnboarding()} disabled={resetting}>
          {resetting ? t('settings.about.resetting') : t('settings.about.onboardingAction')}
        </Button>
        {error && (
          <p role="alert" className="mt-2 text-body-sm text-danger">
            {error}
          </p>
        )}
      </section>

      <section aria-label={t('settings.about.diagnosticsTitle')} className="rounded-lg border border-hairline bg-surface-1 p-6">
        <p className="text-card-title text-ink">{t('settings.about.diagnosticsTitle')}</p>
        <p className="mt-1 text-body-sm text-ink-muted">{t('settings.about.diagnosticsDesc')}</p>
        <Button className="mt-3" variant="secondary" onClick={() => void handlePreviewDiagnostics()} disabled={diagBusy}>
          {diagBusy ? t('settings.about.diagnosticsBusy') : t('settings.about.diagnosticsAction')}
        </Button>
      </section>

      <section aria-label={t('settings.about.docsTitle')} className="rounded-lg border border-hairline bg-surface-1 p-6">
        <p className="text-card-title text-ink">{t('settings.about.docsTitle')}</p>
        <ul className="mt-3 divide-y divide-hairline">
          {DOC_LINKS.map(({ to, titleKey, descKey }) => (
            <li key={to}>
              <Link
                to={to}
                className="flex min-h-11 items-center gap-2 py-3 text-body-sm text-ink transition-colors hover:text-accent-hover"
              >
                <span className="flex-1">
                  <span className="font-medium">{t(titleKey)}</span>
                  <span className="ml-2 text-caption text-ink-muted">{t(descKey)}</span>
                </span>
                <ChevronRightIcon size={16} className="text-ink-faint" />
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-hairline pt-3 text-caption text-ink-faint">
          {t('settings.about.openSourceNote')}
          <a
            href="https://github.com/MRMU29/discovery-copilot-web"
            target="_blank"
            rel="noreferrer"
            className="text-accent underline underline-offset-2"
          >
            github.com/MRMU29/discovery-copilot-web
          </a>
        </p>
      </section>

      <section aria-label={t('settings.about.resetTitle')} className="rounded-lg border border-danger/40 bg-surface-1 p-6">
        <p className="text-card-title text-danger">{t('settings.about.resetTitle')}</p>
        <p className="mt-1 text-body-sm text-ink-secondary">{t('settings.about.resetDesc')}</p>
        <Button className="mt-3" variant="danger" onClick={() => void handleResetApp()} disabled={wiping}>
          {wiping ? t('settings.about.resetting') : t('settings.about.resetAction')}
        </Button>
      </section>

      <Dialog open={diagPending !== null} title={t('settings.about.diagPreviewTitle')} onClose={() => setDiagPending(null)} size="lg">
        {diagPending && (
          <div className="space-y-3">
            <p className="text-caption text-ink-muted">
              {t('settings.about.diagPreviewNote', { count: diagPending.aiRequests.length })}
            </p>
            <pre className="max-h-[46dvh] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-hairline bg-surface-2 p-3 font-mono text-xs text-ink">
              {JSON.stringify(diagPending, null, 2)}
            </pre>
            <div className="flex gap-2">
              <Button onClick={() => handleExportDiagnostics(diagPending)}>{t('settings.about.diagExport')}</Button>
              <Button variant="ghost" onClick={() => setDiagPending(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
