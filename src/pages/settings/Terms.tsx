import { Link } from 'react-router-dom'
import { useT } from '@/lib/i18n'

const SECTIONS = [
  { titleKey: 'settings.terms.s1.title', bodyKeys: ['settings.terms.s1.p1'] },
  { titleKey: 'settings.terms.s2.title', bodyKeys: ['settings.terms.s2.p1', 'settings.terms.s2.p2'] },
  { titleKey: 'settings.terms.s3.title', bodyKeys: ['settings.terms.s3.p1', 'settings.terms.s3.p2'] },
  { titleKey: 'settings.terms.s4.title', bodyKeys: ['settings.terms.s4.p1', 'settings.terms.s4.p2', 'settings.terms.s4.p3'] },
  { titleKey: 'settings.terms.s5.title', bodyKeys: ['settings.terms.s5.p1', 'settings.terms.s5.p2'] },
  { titleKey: 'settings.terms.s6.title', bodyKeys: ['settings.terms.s6.p1'] },
  { titleKey: 'settings.terms.s7.title', bodyKeys: ['settings.terms.s7.p1'] },
] as const

const DISCLAIMER_KEYS = ['settings.terms.s8.p1', 'settings.terms.s8.p2', 'settings.terms.s8.p3'] as const

/** 设置内文档页：用户协议（含免责声明；入口在「关于 → 产品与文档」）。 */
export default function Terms() {
  const t = useT()
  return (
    <div className="space-y-4">
      <div>
        <Link to="/settings/about" className="inline-flex min-h-11 items-center text-body-sm text-ink-muted hover:text-ink">
          ← {t('settings.product.back')}
        </Link>
        <h2 className="mt-2 text-headline text-ink">{t('settings.terms.title')}</h2>
        <p className="mt-1 text-body-sm text-ink-muted">{t('settings.terms.updated')}</p>
      </div>

      <section className="rounded-lg border border-hairline bg-surface-1 p-6">
        <p className="text-body text-ink-secondary">{t('settings.terms.preamble')}</p>
      </section>

      {SECTIONS.map((section) => (
        <section key={section.titleKey} aria-label={t(section.titleKey)} className="rounded-lg border border-hairline bg-surface-1 p-6">
          <p className="text-card-title text-ink">{t(section.titleKey)}</p>
          <div className="mt-2 space-y-2">
            {section.bodyKeys.map((bodyKey) => (
              <p key={bodyKey} className="text-body-sm text-ink-secondary">
                {t(bodyKey)}
              </p>
            ))}
          </div>
        </section>
      ))}

      <section aria-label={t('settings.terms.s8.title')} className="rounded-lg border border-warning/50 bg-warning/5 p-6">
        <p className="text-card-title text-warning">{t('settings.terms.s8.title')}</p>
        <div className="mt-2 space-y-2">
          {DISCLAIMER_KEYS.map((bodyKey) => (
            <p key={bodyKey} className="text-body-sm text-ink-secondary">
              {t(bodyKey)}
            </p>
          ))}
        </div>
      </section>

      <section aria-label={t('settings.terms.s9.title')} className="rounded-lg border border-hairline bg-surface-1 p-6">
        <p className="text-card-title text-ink">{t('settings.terms.s9.title')}</p>
        <div className="mt-2 space-y-2 text-body-sm text-ink-secondary">
          <p>{t('settings.terms.s9.p1')}</p>
          <p>
            {t('settings.terms.s9.p2')}{' '}
            <a
              href="https://github.com/MRMU29/discovery-copilot-web/issues"
              target="_blank"
              rel="noreferrer"
              className="text-accent underline underline-offset-2"
            >
              github.com/MRMU29/discovery-copilot-web/issues
            </a>
          </p>
          <p>
            {t('settings.terms.s9.p3')}{' '}
            <Link to="/settings/privacy" className="text-accent underline underline-offset-2">
              {t('settings.about.docPrivacy')}
            </Link>{' '}
            ·{' '}
            <Link to="/settings/product" className="text-accent underline underline-offset-2">
              {t('settings.about.docProduct')}
            </Link>
          </p>
        </div>
      </section>
    </div>
  )
}
