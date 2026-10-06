import { Link } from 'react-router-dom'
import { useT } from '@/lib/i18n'

const STORED_KEYS = [
  'settings.privacy.stored1',
  'settings.privacy.stored2',
  'settings.privacy.stored3',
  'settings.privacy.stored4',
  'settings.privacy.stored5',
] as const

/** 设置内文档页：隐私政策（从「关于 → 产品与文档」进入，不进设置侧栏）。 */
export default function Privacy() {
  const t = useT()
  return (
    <div className="space-y-4">
      <div>
        <Link to="/settings/about" className="inline-flex min-h-11 items-center text-body-sm text-ink-muted hover:text-ink">
          ← {t('settings.product.back')}
        </Link>
        <h2 className="mt-2 text-headline text-ink">{t('settings.privacy.title')}</h2>
      </div>

      <section className="rounded-lg border border-hairline bg-surface-1 p-6">
        <p className="text-card-title text-ink">{t('settings.privacy.summaryTitle')}</p>
        <p className="mt-2 text-body text-ink-secondary">{t('settings.privacy.summary')}</p>
      </section>

      <section aria-label={t('settings.privacy.storedTitle')} className="rounded-lg border border-hairline bg-surface-1 p-6">
        <p className="text-card-title text-ink">{t('settings.privacy.storedTitle')}</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-body-sm text-ink-secondary">
          {STORED_KEYS.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
        <p className="mt-3 text-caption text-ink-faint">{t('settings.privacy.storedKeyNote')}</p>
      </section>

      <section aria-label={t('settings.privacy.flowTitle')} className="rounded-lg border border-hairline bg-surface-1 p-6">
        <p className="text-card-title text-ink">{t('settings.privacy.flowTitle')}</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-body-sm text-ink-secondary">
          <li>{t('settings.privacy.flowByok')}</li>
          <li>{t('settings.privacy.flowRelay')}</li>
          <li>{t('settings.privacy.flowHosting')}</li>
        </ul>
      </section>

      <section aria-label={t('settings.privacy.diagnosticsTitle')} className="rounded-lg border border-hairline bg-surface-1 p-6">
        <p className="text-card-title text-ink">{t('settings.privacy.diagnosticsTitle')}</p>
        <p className="mt-2 text-body-sm text-ink-secondary">{t('settings.privacy.diagnostics')}</p>
      </section>

      <section aria-label={t('settings.privacy.controlTitle')} className="rounded-lg border border-hairline bg-surface-1 p-6">
        <p className="text-card-title text-ink">{t('settings.privacy.controlTitle')}</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-body-sm text-ink-secondary">
          <li>{t('settings.privacy.controlExport')}</li>
          <li>{t('settings.privacy.controlClear')}</li>
          <li>{t('settings.privacy.controlWarning')}</li>
        </ul>
      </section>

      <section aria-label={t('settings.privacy.changesTitle')} className="rounded-lg border border-hairline bg-surface-1 p-6">
        <p className="text-card-title text-ink">{t('settings.privacy.changesTitle')}</p>
        <p className="mt-2 text-body-sm text-ink-secondary">
          {t('settings.privacy.changesBody')}{' '}
          <a
            href="https://github.com/MRMU29/discovery-copilot-web/issues"
            target="_blank"
            rel="noreferrer"
            className="text-accent underline underline-offset-2"
          >
            GitHub Issues
          </a>{' '}
          {t('settings.privacy.changesTail')}{' '}
          <Link to="/settings/terms" className="text-accent underline underline-offset-2">
            {t('settings.about.docTerms')}
          </Link>{' '}
          ·{' '}
          <Link to="/settings/product" className="text-accent underline underline-offset-2">
            {t('settings.about.docProduct')}
          </Link>
        </p>
      </section>
    </div>
  )
}
