import { describe, expect, it } from 'vitest'
import { QUOTA_WARN_BYTES, requestPersistent, storageEstimate } from '@/db/quota'

const MB = 1024 * 1024

describe('quota module — §5.4 配额预警 / §7.6 持久化申请', () => {
  it('warn threshold is 50 MB', () => {
    expect(QUOTA_WARN_BYTES).toBe(50 * MB)
  })

  it('flags low when free space < 50 MB', async () => {
    const report = await storageEstimate({
      estimate: async () => ({ usage: 200 * MB, quota: 220 * MB }),
    })
    expect(report.low).toBe(true)
    expect(report.usage).toBe(200 * MB)
    expect(report.quota).toBe(220 * MB)
  })

  it('does not flag when free space is comfortable', async () => {
    const report = await storageEstimate({
      estimate: async () => ({ usage: 10 * MB, quota: 1024 * MB }),
    })
    expect(report.low).toBe(false)
  })

  it('degrades to nulls/low=false when estimate() is unavailable', async () => {
    expect(await storageEstimate({})).toEqual({ usage: null, quota: null, low: false })
    expect(await storageEstimate({ estimate: async () => ({}) })).toEqual({
      usage: null,
      quota: null,
      low: false,
    })
  })

  it('passes persistence request through; false when unsupported', async () => {
    expect(await requestPersistent({ persist: async () => true })).toBe(true)
    expect(await requestPersistent({ persist: async () => false })).toBe(false)
    expect(await requestPersistent({})).toBe(false)
  })
})
