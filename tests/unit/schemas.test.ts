import { describe, expect, it } from 'vitest'
import { assumptionSchema, projectSchema, settingsRowSchema } from '@/schemas/entities'

const baseAssumption = {
  id: 'a1',
  projectId: 'p1',
  type: 'value',
  statement: '目标用户愿意为离线优先付出切换成本',
  impact: 3,
  risk: 2,
  createdAt: '2026-10-03T00:00:00.000Z',
  updatedAt: '2026-10-03T00:00:00.000Z',
} as const

describe('entity schemas — §9.2 类型与 Schema 同步', () => {
  it('fills defaults: confidence null / status open / priorityScore 0', () => {
    const parsed = assumptionSchema.parse(baseAssumption)
    expect(parsed.confidence).toBeNull()
    expect(parsed.status).toBe('open')
    expect(parsed.priorityScore).toBe(0)
  })

  it('rejects out-of-range impact', () => {
    expect(() => assumptionSchema.parse({ ...baseAssumption, impact: 6 })).toThrow()
    expect(() => assumptionSchema.parse({ ...baseAssumption, impact: 0 })).toThrow()
  })

  it('rejects unknown assumption types (8 类之外)', () => {
    expect(() => assumptionSchema.parse({ ...baseAssumption, type: 'foo' })).toThrow()
  })

  it('fills project defaults: description / status / deletedAt', () => {
    const parsed = projectSchema.parse({
      id: 'p1',
      name: '项目',
      createdAt: '2026-10-03T00:00:00.000Z',
      updatedAt: '2026-10-03T00:00:00.000Z',
    })
    expect(parsed.description).toBe('')
    expect(parsed.status).toBe('active')
    expect(parsed.deletedAt).toBeNull()
  })

  it('settingsRow is strict: secret-shaped fields are structurally impossible', () => {
    const ok = settingsRowSchema.parse({ key: 'app', updatedAt: '2026-10-03T00:00:00.000Z' })
    expect(ok.theme).toBe('system')
    expect(ok.language).toBe('zh-Hans')
    expect(() =>
      settingsRowSchema.parse({ key: 'app', updatedAt: '2026-10-03T00:00:00.000Z', apiKey: 'sk-x' }),
    ).toThrow()
    expect(() =>
      settingsRowSchema.parse({ key: 'app', updatedAt: '2026-10-03T00:00:00.000Z', bogus: 1 }),
    ).toThrow()
  })
})
