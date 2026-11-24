import { useSyncExternalStore } from 'react'
import { zhHans } from './dictionaries/zh-Hans'

/**
 * Lightweight i18n (zero-dependency decision): flat dictionaries, a module
 * store driven from AppShell's settings liveQuery, and useT() re-rendering
 * subscribers on locale change. Missing keys fall back to zh-Hans, then to
 * the key itself. Coverage note: interface layer first — project workspace
 * pages, AI dialogs, Relay panel and service-layer messages stay zh-Hans
 * for now and migrate batch by batch.
 */

export const LOCALES = ['zh-Hans', 'zh-Hant', 'en', 'ja', 'ko', 'ru', 'de', 'fr'] as const
export type Locale = (typeof LOCALES)[number]

export type Dict = typeof zhHans

/** Native names — always shown in their own language, never translated. */
export const LOCALE_LABELS: Record<Locale, string> = {
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  ru: 'Русский',
  de: 'Deutsch',
  fr: 'Français',
}

/** BCP-47 tag per locale — also what <html lang> and exported documents use. */
export const LOCALE_TAGS: Record<Locale, string> = {
  'zh-Hans': 'zh-CN',
  'zh-Hant': 'zh-TW',
  en: 'en',
  ja: 'ja',
  ko: 'ko',
  ru: 'ru',
  de: 'de',
  fr: 'fr',
}

/**
 * Only zh-Hans is bundled eagerly. The other seven dictionaries are one lazy
 * chunk each: they used to be ~7,000 lines pulled into the first paint for every
 * user regardless of their language. `translate` falls back to zh-Hans until the
 * requested dictionary lands, then notifies subscribers.
 */
const LOADED: Partial<Record<Locale, Dict>> = { 'zh-Hans': zhHans }

const DICT_EXPORT: Record<Locale, string> = {
  'zh-Hans': 'zhHans',
  'zh-Hant': 'zhHant',
  en: 'en',
  ja: 'ja',
  ko: 'ko',
  ru: 'ru',
  de: 'de',
  fr: 'fr',
}

const LOADERS: Record<Locale, () => Promise<Record<string, unknown>>> = {
  'zh-Hans': async () => ({ zhHans }),
  'zh-Hant': () => import('./dictionaries/zh-Hant'),
  en: () => import('./dictionaries/en'),
  ja: () => import('./dictionaries/ja'),
  ko: () => import('./dictionaries/ko'),
  ru: () => import('./dictionaries/ru'),
  de: () => import('./dictionaries/de'),
  fr: () => import('./dictionaries/fr'),
}

export type TParams = Record<string, string | number>

let currentLocale: Locale = 'zh-Hans'
/**
 * Bumped every time a dictionary chunk lands. The external-store snapshot below
 * includes it because a freshly loaded dictionary must re-render subscribers even
 * though the locale itself did not change — without this the UI stayed on the
 * zh-Hans fallback until the next navigation.
 */
let dictGeneration = 0
const listeners = new Set<() => void>()

export function getLocale(): Locale {
  return currentLocale
}

/** Loads one dictionary chunk (no-op when already resident). */
export async function loadLocale(locale: Locale): Promise<void> {
  if (LOADED[locale]) return
  const module = await LOADERS[locale]()
  LOADED[locale] = module[DICT_EXPORT[locale]] as Dict
  dictGeneration += 1
  if (locale === currentLocale) notify()
}

function notify(): void {
  for (const listener of listeners) listener()
}

/**
 * AppShell keeps this in sync with settings.language (liveQuery-driven). Awaits
 * the dictionary chunk so callers/tests can rely on translations being present
 * right after the call; the current locale is applied immediately either way.
 */
export async function setLocale(locale: Locale): Promise<void> {
  if (locale !== currentLocale) {
    currentLocale = locale
    if (typeof document !== 'undefined') document.documentElement.lang = LOCALE_TAGS[locale]
    notify()
  }
  await loadLocale(locale)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** {name} interpolation; unknown params are left untouched. */
export function translate(key: string, params?: TParams): string {
  const active = (LOADED[currentLocale] ?? zhHans) as unknown as Record<string, string>
  const base = zhHans as unknown as Record<string, string>
  let text: string = active[key] ?? base[key] ?? key
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
  }
  return text
}

const getServerLocale = (): string => 'zh-Hans#0'

/** Locale + dictionary generation: changes when either the locale or its dict changes. */
const getLocaleSnapshot = (): string => `${currentLocale}#${dictGeneration}`

/** Subscribe the component to locale/dictionary changes; returns the translate fn. */
export function useT(): typeof translate {
  useSyncExternalStore(subscribe, getLocaleSnapshot, getServerLocale)
  return translate
}
