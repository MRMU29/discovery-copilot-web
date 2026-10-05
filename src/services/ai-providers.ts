import type { z } from 'zod'
import { deleteSessionKey } from '@/ai/session'
import { db } from '@/db/db'
import { nowIso } from '@/lib/clock'
import { DomainError } from '@/lib/errors'
import { providerConfigSchema, settingsRowSchema, type ProviderConfigRow } from '@/schemas/entities'
import { getSettings, updateSettings } from './settings'

/**
 * CRUD for persisted provider configs (§6.1). API keys never pass through
 * here — the dialog feeds them straight into the session store; this layer
 * only owns the non-secret rows and the defaultProviderId pointer.
 */

type ProviderInput = Omit<z.input<typeof providerConfigSchema>, 'id' | 'createdAt'>

function normalize(row: ProviderConfigRow): ProviderConfigRow {
  try {
    return providerConfigSchema.parse(row)
  } catch {
    throw new DomainError('CORRUPT_ROW', `Provider 配置损坏且无法规范化: ${row?.id ?? '(unknown id)'}`)
  }
}

/** Oldest first — stable ordering for the picker as providers accumulate. */
export async function listProviders(): Promise<ProviderConfigRow[]> {
  const rows = await db.ai_providers.toArray()
  return rows.map(normalize).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function createProvider(input: ProviderInput): Promise<ProviderConfigRow> {
  const row = providerConfigSchema.parse({
    ...input,
    id: crypto.randomUUID(),
    baseUrl: input.baseUrl.trim().replace(/\/+$/, ''),
    createdAt: nowIso(),
  })
  await db.ai_providers.put(row)
  return row
}

export async function deleteProvider(id: string): Promise<void> {
  await db.transaction('rw', [db.ai_providers, db.settings], async () => {
    const existing = await db.ai_providers.get(id)
    if (!existing) throw new DomainError('NOT_FOUND', `Provider 不存在: ${id}`)
    await db.ai_providers.delete(id)
    const settings = await db.settings.get('app')
    if (settings && settings.defaultProviderId === id) {
      await db.settings.put(
        settingsRowSchema.parse({ ...settings, defaultProviderId: null, updatedAt: nowIso() }),
      )
    }
  })
  // Session key of a deleted provider is dead weight; drop it eagerly.
  deleteSessionKey(id)
}

export async function setDefaultProvider(id: string | null): Promise<void> {
  if (id !== null && !(await db.ai_providers.get(id))) {
    throw new DomainError('NOT_FOUND', `Provider 不存在: ${id}`)
  }
  await updateSettings({ defaultProviderId: id })
}

/** The provider new AI features preselect, or null when none configured. */
export async function resolveDefaultProvider(): Promise<ProviderConfigRow | null> {
  const { defaultProviderId } = await getSettings()
  if (!defaultProviderId) return null
  const row = await db.ai_providers.get(defaultProviderId)
  return row ? normalize(row) : null
}
