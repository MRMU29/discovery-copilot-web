import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { resolveAiRoute } from '@/lib/ai-mode'
import { settingsSchema } from '@/schemas/entities'
import { getSettings, updateSettings } from '@/services/settings'
import { resetDb } from '@/db/db'

beforeEach(async () => {
  await resetDb()
})

describe('AI mode settings (command 6)', () => {
  it('defaults to relay so the app works with zero configuration', async () => {
    const settings = await getSettings()
    expect(settings.aiMode).toBe('relay')
  })

  it('schema default matches the service default', () => {
    expect(settingsSchema.parse({ updatedAt: '2026-10-03T00:00:00.000Z' }).aiMode).toBe('relay')
  })

  it('round-trips through updateSettings across all three modes', async () => {
    await updateSettings({ aiMode: 'byok' })
    expect((await getSettings()).aiMode).toBe('byok')

    await updateSettings({ aiMode: 'hybrid' })
    expect((await getSettings()).aiMode).toBe('hybrid')

    await updateSettings({ aiMode: 'relay' })
    expect((await getSettings()).aiMode).toBe('relay')
  })

  it('rejects an unknown mode', async () => {
    await expect(updateSettings({ aiMode: 'bogus' })).rejects.toThrowError()
  })
})

describe('resolveAiRoute', () => {
  it('byok always routes to BYOK', () => {
    expect(resolveAiRoute('byok', true)).toBe('byok')
    expect(resolveAiRoute('byok', false)).toBe('byok')
  })

  it('relay always routes to Relay', () => {
    expect(resolveAiRoute('relay', true)).toBe('relay')
    expect(resolveAiRoute('relay', false)).toBe('relay')
  })

  it('hybrid routes by provider presence', () => {
    expect(resolveAiRoute('hybrid', true)).toBe('byok')
    expect(resolveAiRoute('hybrid', false)).toBe('relay')
  })
})
