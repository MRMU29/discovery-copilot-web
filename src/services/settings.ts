import { ZodError } from 'zod'
import { db } from '@/db/db'
import { settingsRepo } from '@/db/repositories'
import { nowIso } from '@/lib/clock'
import { DomainError } from '@/lib/errors'
import { settingsRowSchema, settingsSchema, type Settings } from '@/schemas/entities'

const SETTINGS_KEY = 'app'

/** Keys that must never enter persisted settings (§6.3: keys stay in session memory only). */
const SECRET_KEY_RE = /(api[\s_-]*key|secret|token|password|credential)/i

export async function getSettings(): Promise<Settings> {
  const row = await settingsRepo.get(SETTINGS_KEY)
  if (!row) return settingsSchema.parse({ updatedAt: nowIso() })
  const parsed = settingsRowSchema.parse(row)
  return {
    theme: parsed.theme,
    language: parsed.language,
    defaultProviderId: parsed.defaultProviderId,
    aiMode: parsed.aiMode,
    perRequestBudgetUsd: parsed.perRequestBudgetUsd,
    monthlyBudgetUsd: parsed.monthlyBudgetUsd,
    updatedAt: parsed.updatedAt,
  }
}

export async function updateSettings(patch: Record<string, unknown>): Promise<Settings> {
  for (const key of Object.keys(patch)) {
    if (SECRET_KEY_RE.test(key)) {
      throw new DomainError('SECRET_REJECTED', `设置不允许携带疑似密钥字段: ${key}`)
    }
  }
  return db.transaction('rw', db.settings, async () => {
    const current = await getSettings()
    try {
      const row = settingsRowSchema.parse({ ...current, ...patch, key: SETTINGS_KEY })
      await settingsRepo.put(row)
      return row
    } catch (err) {
      if (err instanceof ZodError) {
        const paths = err.issues.map((i) => i.path.join('.')).join(', ')
        throw new DomainError('INVALID_INPUT', `设置项校验失败: ${paths}`)
      }
      throw err
    }
  })
}
