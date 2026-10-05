import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { deleteSessionKey, hasSessionKey, setSessionKey } from '@/ai/session'
import { resetDb } from '@/db/db'
import { DomainError } from '@/lib/errors'
import {
  createProvider,
  deleteProvider,
  listProviders,
  resolveDefaultProvider,
  setDefaultProvider,
} from '@/services/ai-providers'
import { getSettings } from '@/services/settings'

beforeEach(async () => {
  await resetDb()
})

const baseInput = {
  label: 'DeepSeek',
  kind: 'openai-compatible' as const,
  baseUrl: 'https://api.deepseek.com/v1/',
  model: 'deepseek-chat',
}

describe('ai-providers service (command 5)', () => {
  it('creates with a normalized baseUrl and lists oldest first', async () => {
    const first = await createProvider(baseInput)
    expect(first.baseUrl).toBe('https://api.deepseek.com/v1')
    expect(first.id).toBeTruthy()

    await new Promise((r) => setTimeout(r, 2)) // distinct createdAt for stable ordering
    const second = await createProvider({ ...baseInput, label: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1///' })
    expect(second.baseUrl).toBe('https://api.moonshot.cn/v1')

    const rows = await listProviders()
    expect(rows.map((r) => r.id)).toEqual([first.id, second.id])
  })

  it('rejects a non-URL baseUrl', async () => {
    await expect(createProvider({ ...baseInput, baseUrl: 'not a url' })).rejects.toThrowError()
  })

  it('delete clears the default pointer and the session key', async () => {
    const provider = await createProvider(baseInput)
    await setDefaultProvider(provider.id)
    setSessionKey(provider.id, 'sk-test')
    expect((await getSettings()).defaultProviderId).toBe(provider.id)
    expect(hasSessionKey(provider.id)).toBe(true)

    await deleteProvider(provider.id)

    expect((await getSettings()).defaultProviderId).toBeNull()
    expect(hasSessionKey(provider.id)).toBe(false)
    expect(await listProviders()).toHaveLength(0)
  })

  it('delete of an unknown id throws NOT_FOUND', async () => {
    await expect(deleteProvider('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' } as Partial<DomainError>)
  })

  it('setDefaultProvider(null) is allowed, unknown id is not', async () => {
    await expect(setDefaultProvider('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await setDefaultProvider(null)
    expect((await getSettings()).defaultProviderId).toBeNull()
  })

  it('resolveDefaultProvider returns null before any default is set', async () => {
    expect(await resolveDefaultProvider()).toBeNull()
    const provider = await createProvider(baseInput)
    await setDefaultProvider(provider.id)
    expect((await resolveDefaultProvider())?.id).toBe(provider.id)
    // Session keys are untouched by service calls — dialog owns the key lifecycle.
    expect(hasSessionKey(provider.id)).toBe(false)
    deleteSessionKey(provider.id)
  })
})
