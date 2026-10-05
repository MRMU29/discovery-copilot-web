import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '@/db/db'
import {
  getOnboarding,
  markOnboardingDone,
  resetOnboarding,
} from '@/services/onboarding'
import { getSettings, updateSettings } from '@/services/settings'

beforeEach(async () => {
  await resetDb()
})

describe('onboarding state (command 7)', () => {
  it('defaults to all-undone on a fresh browser', async () => {
    expect(await getOnboarding()).toEqual({ welcome: false, fieldHints: false, promptRelay: false })
  })

  it('marks steps done independently', async () => {
    await markOnboardingDone('welcome')
    expect(await getOnboarding()).toEqual({ welcome: true, fieldHints: false, promptRelay: false })

    await markOnboardingDone('promptRelay')
    expect(await getOnboarding()).toEqual({ welcome: true, fieldHints: false, promptRelay: true })
  })

  it('resets every step for replaying the tour', async () => {
    await markOnboardingDone('welcome')
    await markOnboardingDone('fieldHints')
    await resetOnboarding()
    expect(await getOnboarding()).toEqual({ welcome: false, fieldHints: false, promptRelay: false })
  })

  it('shares the settings table without disturbing app settings', async () => {
    await updateSettings({ aiMode: 'byok' })
    await markOnboardingDone('welcome')
    const settings = await getSettings()
    expect(settings.aiMode).toBe('byok')
    expect((await getOnboarding()).welcome).toBe(true)
  })
})
