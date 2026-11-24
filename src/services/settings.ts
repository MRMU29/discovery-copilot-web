import { ZodError } from 'zod'
import { db } from '@/db/db'
import { settingsRepo } from '@/db/repositories'
import { nowIso } from '@/lib/clock'
import { DomainError } from '@/lib/errors'
import { settingsRowSchema, settingsSchema, type Settings } from '@/schemas/entities'

const SETTINGS_KEY = 'app'

/** Keys that must never enter persisted settings (§6.3: keys stay in session memory only). */
// Suffix-shaped secrets (apiKey / openaiApiKey / clientSecret / password …) plus
// bare bearer-token field names. Substring matching used to reject legitimate
// future fields such as `tokenBudget`; these two anchored patterns do not.
const SECRET_KEY_SUFFIX_RE = /(?:api[\s_-]*key|secret|password|passwd|credential|private[\s_-]*key)$/i
const SECRET_KEY_EXACT_RE = /^(?:token|access[\s_-]*token|auth[\s_-]*token|refresh[\s_-]*token|bearer)$/i

function looksLikeSecretKey(key: string): boolean {
  return SECRET_KEY_SUFFIX_RE.test(key) || SECRET_KEY_EXACT_RE.test(key)
}

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
    lastBackupAt: parsed.lastBackupAt,
    updatedAt: parsed.updatedAt,
  }
}

export async function updateSettings(patch: Record<string, unknown>): Promise<Settings> {
  for (const key of Object.keys(patch)) {
    if (looksLikeSecretKey(key)) {
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
