import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '@/db/db'
import { updateSettings } from '@/services/settings'

/**
 * §6.3: settings must structurally reject secret-shaped fields. The old
 * substring regex also rejected harmless future fields (`tokenBudget`), so the
 * check is now suffix/exact anchored — these cases pin both directions.
 */
describe('settings rejects secret keys without over-blocking', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it.each(['apiKey', 'api_key', 'openaiApiKey', 'clientSecret', 'password', 'token', 'accessToken'])(
    'rejects %s',
    async (field) => {
      await expect(updateSettings({ [field]: 'x' })).rejects.toMatchObject({ code: 'SECRET_REJECTED' })
    },
  )

  // The settings row is a strict object, so an unknown (but non-secret) field still
  // fails schema validation — the point is that it is *not* rejected by the secret
  // guard. That distinction is what keeps future legitimate fields possible.
  it.each(['tokenBudget', 'maxTokensPerRequest', 'secretaryName'])(
    'does not treat %s as a secret',
    async (field) => {
      await expect(updateSettings({ [field]: 'ok' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    },
  )

  it('accepts a known legitimate setting', async () => {
    await expect(updateSettings({ theme: 'dark' })).resolves.toMatchObject({ theme: 'dark' })
  })
})
