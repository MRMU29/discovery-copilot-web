// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { clearReportDraft, loadReportDraft, saveReportDraft } from '@/lib/report-draft'
import { userMessage } from '@/ai/errors'

beforeEach(() => {
  localStorage.clear()
})

describe('report drafts (localStorage 草稿防丢失)', () => {
  it('saves, loads and clears a draft round-trip', () => {
    saveReportDraft('r1', { title: '标题', content: '## 草稿正文' })
    expect(loadReportDraft('r1')).toEqual({ title: '标题', content: '## 草稿正文' })
    clearReportDraft('r1')
    expect(loadReportDraft('r1')).toBeNull()
  })

  it('returns null for missing or corrupted drafts', () => {
    expect(loadReportDraft('missing')).toBeNull()
    localStorage.setItem('dcopilot.draft.report.bad', '{not json')
    expect(loadReportDraft('bad')).toBeNull()
    localStorage.setItem('dcopilot.draft.report.bad', '{"title":42}')
    expect(loadReportDraft('bad')).toBeNull()
  })
})

describe('userMessage offline branch', () => {
  it('gives an offline-specific hint when the device is offline', () => {
    const original = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine')
    Object.defineProperty(Navigator.prototype, 'onLine', { value: false, configurable: true })
    try {
      expect(userMessage('NETWORK')).toContain('离线')
    } finally {
      if (original) Object.defineProperty(Navigator.prototype, 'onLine', original)
    }
    expect(userMessage('NETWORK')).toContain('CORS')
  })

  it('leaves other codes untouched', () => {
    expect(userMessage('ABORTED')).toBe('请求已取消。')
  })
})
