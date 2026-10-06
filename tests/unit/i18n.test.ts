import { describe, expect, it } from 'vitest'
import { LOCALES, getLocale, setLocale, translate } from '@/lib/i18n'
import { zhHans } from '@/lib/i18n/dictionaries/zh-Hans'
import { zhHant } from '@/lib/i18n/dictionaries/zh-Hant'
import { en } from '@/lib/i18n/dictionaries/en'
import { ja } from '@/lib/i18n/dictionaries/ja'
import { ko } from '@/lib/i18n/dictionaries/ko'
import { ru } from '@/lib/i18n/dictionaries/ru'
import { de } from '@/lib/i18n/dictionaries/de'
import { fr } from '@/lib/i18n/dictionaries/fr'

const BASE_KEYS = Object.keys(zhHans).sort()

describe('dictionaries — key parity with zh-Hans', () => {
  // 漏译防护:每个语言字典的键集必须与 zh-Hans 完全一致
  // (Dict 类型在编译期兜底,这里再运行时兜底一次)。
  const DICTS = { 'zh-Hant': zhHant, en, ja, ko, ru, de, fr } as const

  it('zh-Hans is the non-empty baseline', () => {
    expect(BASE_KEYS.length).toBeGreaterThan(200)
    for (const key of BASE_KEYS) {
      expect(zhHans[key as keyof typeof zhHans].trim().length).toBeGreaterThan(0)
    }
  })

  for (const [name, dict] of Object.entries(DICTS)) {
    it(`${name} covers exactly the zh-Hans key set`, () => {
      expect(Object.keys(dict).sort()).toEqual(BASE_KEYS)
    })
    it(`${name} has no placeholder Chinese left`, () => {
      // 简繁中日韩四语的文字系统天然含汉字(日文汉字/韩文汉字或专名),
      // 只对拉丁/西里尔语言做"漏翻成中文"的占位检查。
      if (name === 'zh-Hant' || name === 'ja' || name === 'ko') return
      for (const [key, value] of Object.entries(dict)) {
        expect({ key, value, cjk: /[\u4e00-\u9fff]/.test(value) }).toEqual({ key, value, cjk: false })
      }
    })
  }

  it('LOCALES covers every dictionary', () => {
    expect(LOCALES).toHaveLength(8)
  })
})

describe('translate', () => {
  it('resolves keys in the active locale', () => {
    setLocale('en')
    expect(getLocale()).toBe('en')
    expect(translate('common.cancel')).toBe(en['common.cancel'])
    setLocale('zh-Hans')
    expect(translate('common.cancel')).toBe(zhHans['common.cancel'])
  })

  it('interpolates {params}', () => {
    setLocale('en')
    expect(translate('dashboard.trash', { count: 3 })).toBe('Recycle bin (3)')
    setLocale('zh-Hans')
    expect(translate('dashboard.trash', { count: 3 })).toBe('回收站（3）')
  })

  it('falls back to the key for unknown keys and unknown params are untouched', () => {
    expect(translate('no.such.key')).toBe('no.such.key')
    expect(translate('common.cancel', { bogus: 'x' })).toBe(zhHans['common.cancel'])
  })
})
