import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { ThemePref } from '@/lib/theme'
import { LOCALES, LOCALE_LABELS, useT, type Locale } from '@/lib/i18n'
import { getSettings, updateSettings } from '@/services/settings'

const THEME_OPTIONS: { value: ThemePref; labelKey: string; descKey: string }[] = [
  {
    value: 'system',
    labelKey: 'settings.appearance.themeSystem',
    descKey: 'settings.appearance.themeSystemDesc',
  },
  {
    value: 'light',
    labelKey: 'settings.appearance.themeLight',
    descKey: 'settings.appearance.themeLightDesc',
  },
  {
    value: 'dark',
    labelKey: 'settings.appearance.themeDark',
    descKey: 'settings.appearance.themeDarkDesc',
  },
]

/** 设置页「外观」：主题三选 + 界面语言八选（即改即存，随 settings.liveQuery 即时生效）。 */
export default function Appearance() {
  const t = useT()
  const settings = useLiveQuery(() => getSettings(), [])
  const [error, setError] = useState<string | null>(null)

  async function handleTheme(theme: ThemePref) {
    setError(null)
    try {
      await updateSettings({ theme })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleLanguage(language: Locale) {
    setError(null)
    try {
      await updateSettings({ language })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (settings === undefined) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 animate-pulse rounded-md bg-surface-3" />
        <div className="h-32 animate-pulse rounded-lg bg-surface-3" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-headline text-ink">{t('settings.appearance.title')}</h1>
        <p className="mt-1 text-body-sm text-ink-muted">{t('settings.appearance.desc')}</p>
      </header>

      <section aria-label={t('settings.appearance.themeHeading')} className="space-y-3">
        <h2 className="text-eyebrow text-ink-muted">{t('settings.appearance.themeHeading')}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {THEME_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex min-h-11 cursor-pointer flex-col gap-1 rounded-lg border p-4 transition-colors ${
                settings.theme === option.value
                  ? 'border-accent ring-1 ring-accent'
                  : 'border-hairline bg-surface-1 hover:bg-surface-2'
              }`}
            >
              <span className="flex items-center gap-2 text-body text-ink">
                <input
                  type="radio"
                  name="theme"
                  value={option.value}
                  checked={settings.theme === option.value}
                  onChange={() => void handleTheme(option.value)}
                  className="size-4 accent-accent"
                />
                {t(option.labelKey)}
              </span>
              <span className="text-caption text-ink-muted">{t(option.descKey)}</span>
            </label>
          ))}
        </div>
        <p
          role="status"
          className="rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-caption text-ink-secondary"
        >
          {t('settings.appearance.currentThemePrefix')}
          {settings.theme === 'system'
            ? t('settings.appearance.currentThemeSystem')
            : settings.theme === 'light'
              ? t('settings.appearance.themeLight')
              : t('settings.appearance.themeDark')}
        </p>
      </section>

      <section aria-label={t('settings.appearance.languageHeading')} className="space-y-3">
        <h2 className="text-eyebrow text-ink-muted">{t('settings.appearance.languageHeading')}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {LOCALES.map((locale) => (
            <label
              key={locale}
              className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border p-4 transition-colors ${
                settings.language === locale
                  ? 'border-accent ring-1 ring-accent'
                  : 'border-hairline bg-surface-1 hover:bg-surface-2'
              }`}
            >
              <input
                type="radio"
                name="language"
                value={locale}
                checked={settings.language === locale}
                onChange={() => void handleLanguage(locale)}
                className="size-4 accent-accent"
              />
              <span className="text-body text-ink">{LOCALE_LABELS[locale]}</span>
            </label>
          ))}
        </div>
        <p
          role="status"
          className="rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-caption text-ink-secondary"
        >
          {t('settings.appearance.currentLanguagePrefix')}
          {LOCALE_LABELS[settings.language]}
        </p>
        <p className="text-caption text-ink-faint">{t('settings.appearance.languageHint')}</p>
      </section>

      {error && (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
