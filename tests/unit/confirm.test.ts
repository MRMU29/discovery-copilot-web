// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  confirmAction,
  getPendingConfirm,
  settleConfirm,
  subscribeConfirm,
} from '@/lib/confirm'

const cleanups: (() => void)[] = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
  settleConfirm(false)
  vi.restoreAllMocks()
})

describe('confirmAction — 无 host 时回退到 window.confirm', () => {
  it('returns the native result so non-React callers keep working', async () => {
    const native = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await expect(confirmAction({ title: '删除？', body: '不可恢复' })).resolves.toBe(true)
    expect(native).toHaveBeenCalledWith('删除？\n\n不可恢复')
  })
})

describe('confirmAction — 有 host 时走 Promise', () => {
  it('settles true when confirmed and notifies subscribers', async () => {
    let notifications = 0
    cleanups.push(subscribeConfirm(() => (notifications += 1)))

    const answer = confirmAction({ title: '清空数据', tone: 'danger' })
    expect(getPendingConfirm()?.title).toBe('清空数据')
    expect(getPendingConfirm()?.tone).toBe('danger')

    settleConfirm(true)
    await expect(answer).resolves.toBe(true)
    expect(getPendingConfirm()).toBeNull()
    expect(notifications).toBeGreaterThan(0)
  })

  it('settles false when dismissed', async () => {
    cleanups.push(subscribeConfirm(() => undefined))
    const answer = confirmAction({ title: '删除项目' })
    settleConfirm(false)
    await expect(answer).resolves.toBe(false)
  })

  it('cancels the previous request when a new one replaces it (no dangling Promise)', async () => {
    cleanups.push(subscribeConfirm(() => undefined))
    const first = confirmAction({ title: '第一个' })
    const second = confirmAction({ title: '第二个' })
    await expect(first).resolves.toBe(false)
    expect(getPendingConfirm()?.title).toBe('第二个')
    settleConfirm(true)
    await expect(second).resolves.toBe(true)
  })
})
