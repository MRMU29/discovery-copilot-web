import { useSyncExternalStore } from 'react'
import { zhHans } from './dictionaries/zh-Hans'
import { zhHant } from './dictionaries/zh-Hant'
import { en } from './dictionaries/en'
import { ja } from './dictionaries/ja'
import { ko } from './dictionaries/ko'
import { ru } from './dictionaries/ru'
import { de } from './dictionaries/de'
import { fr } from './dictionaries/fr'

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

const HTML_LANG: Record<Locale, string> = {
  'zh-Hans': 'zh-CN',
  'zh-Hant': 'zh-TW',
  en: 'en',
  ja: 'ja',
  ko: 'ko',
  ru: 'ru',
  de: 'de',
  fr: 'fr',
}

const DICTS: Record<Locale, Dict> = { 'zh-Hans': zhHans, 'zh-Hant': zhHant, en, ja, ko, ru, de, fr }

export type TParams = Record<string, string | number>

let currentLocale: Locale = 'zh-Hans'
const listeners = new Set<() => void>()

export function getLocale(): Locale {
  return currentLocale
}

/** AppShell keeps this in sync with settings.language (liveQuery-driven). */
export function setLocale(locale: Locale): void {
  if (locale === currentLocale) return
  currentLocale = locale
  if (typeof document !== 'undefined') document.documentElement.lang = HTML_LANG[locale]
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** {name} interpolation; unknown params are left untouched. */
export function translate(key: string, params?: TParams): string {
  const active = DICTS[currentLocale] as unknown as Record<string, string>
  const base = zhHans as unknown as Record<string, string>
  let text: string = active[key] ?? base[key] ?? key
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
  }
  return text
}

const getServerLocale = (): Locale => 'zh-Hans'

/** Subscribe the component to locale changes; returns the stable translate fn. */
export function useT(): typeof translate {
  useSyncExternalStore(subscribe, getLocale, getServerLocale)
  return translate
}
