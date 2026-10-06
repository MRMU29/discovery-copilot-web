import { Link } from 'react-router-dom'
import { useT } from '@/lib/i18n'

const WORKFLOW = [
  { step: '1', titleKey: 'settings.product.wf1.title', descKey: 'settings.product.wf1.desc' },
  { step: '2', titleKey: 'settings.product.wf2.title', descKey: 'settings.product.wf2.desc' },
  { step: '3', titleKey: 'settings.product.wf3.title', descKey: 'settings.product.wf3.desc' },
  { step: '4', titleKey: 'settings.product.wf4.title', descKey: 'settings.product.wf4.desc' },
  { step: '5', titleKey: 'settings.product.wf5.title', descKey: 'settings.product.wf5.desc' },
] as const

const PRINCIPLES = [
  { titleKey: 'settings.product.p1.title', descKey: 'settings.product.p1.desc' },
  { titleKey: 'settings.product.p2.title', descKey: 'settings.product.p2.desc' },
  { titleKey: 'settings.product.p3.title', descKey: 'settings.product.p3.desc' },
  { titleKey: 'settings.product.p4.title', descKey: 'settings.product.p4.desc' },
] as const

/** 设置内文档页：产品介绍（入口在「关于 → 产品与文档」）。 */
export default function Product() {
  const t = useT()
  return (
    <div className="space-y-4">
      <div>
        <Link to="/settings/about" className="inline-flex min-h-11 items-center text-body-sm text-ink-muted hover:text-ink">
          ← {t('settings.product.back')}
        </Link>
        <h2 className="mt-2 text-headline text-ink">{t('settings.product.title')}</h2>
      </div>

      <section className="rounded-lg border border-hairline bg-surface-1 p-6">
        <p className="text-card-title text-ink">{t('settings.product.introTitle')}</p>
        <p className="mt-2 text-body text-ink-secondary">{t('settings.product.intro')}</p>
        <dl className="mt-4 space-y-1 text-body-sm text-ink-secondary">
          <div>
            <dt className="inline text-ink-faint">{t('settings.product.versionLabel')}</dt>
            <dd className="inline"> {t('settings.product.versionValue', { version: __APP_VERSION__ })}</dd>
          </div>
          <div>
            <dt className="inline text-ink-faint">{t('settings.product.stackLabel')}</dt>
            <dd className="inline"> {t('settings.product.stack')}</dd>
          </div>
        </dl>
      </section>

      <section aria-label={t('settings.product.workflowTitle')} className="rounded-lg border border-hairline bg-surface-1 p-6">
        <p className="text-card-title text-ink">{t('settings.product.workflowTitle')}</p>
        <ol className="mt-3 space-y-3">
          {WORKFLOW.map((item) => (
            <li key={item.step} className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-caption font-medium text-ink"
              >
                {item.step}
              </span>
              <span>
                <span className="text-body-sm font-medium text-ink">{t(item.titleKey)}</span>
                <span className="mt-0.5 block text-caption text-ink-muted">{t(item.descKey)}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-label={t('settings.product.principlesTitle')} className="rounded-lg border border-hairline bg-surface-1 p-6">
        <p className="text-card-title text-ink">{t('settings.product.principlesTitle')}</p>
        <ul className="mt-3 space-y-3">
          {PRINCIPLES.map((p) => (
            <li key={p.titleKey} className="text-body-sm">
              <span className="font-medium text-ink">{t(p.titleKey)}</span>
              <span className="mt-0.5 block text-caption text-ink-muted">{t(p.descKey)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label={t('settings.product.openSourceTitle')} className="rounded-lg border border-hairline bg-surface-1 p-6">
        <p className="text-card-title text-ink">{t('settings.product.openSourceTitle')}</p>
        <p className="mt-2 text-body-sm text-ink-secondary">{t('settings.product.openSourceBody')}</p>
        <p className="mt-3 text-body-sm">
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

      <section aria-label={t('settings.product.moreTitle')} className="rounded-lg border border-hairline bg-surface-1 p-6">
        <p className="text-card-title text-ink">{t('settings.product.moreTitle')}</p>
        <ul className="mt-2 space-y-2 text-body-sm">
          <li>
            <Link to="/settings/privacy" className="text-accent underline underline-offset-2">
              {t('settings.about.docPrivacy')}
            </Link>
            <span className="ml-2 text-caption text-ink-muted">{t('settings.product.linkPrivacyDesc')}</span>
          </li>
          <li>
            <Link to="/settings/terms" className="text-accent underline underline-offset-2">
              {t('settings.about.docTerms')}
            </Link>
            <span className="ml-2 text-caption text-ink-muted">{t('settings.product.linkTermsDesc')}</span>
          </li>
        </ul>
      </section>
    </div>
  )
}
