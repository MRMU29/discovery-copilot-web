// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  buildReportHtmlDocument,
  isUserEdited,
  reportFileName,
  reportMetaLine,
} from '@/lib/report-export'
import { renderMarkdown } from '@/lib/markdown'

const base = {
  title: '自动对账助手 · 发现报告',
  content: '## 背景\n面向中小企业主的自动对账助手。\n\n## 结论与下一步\n优先执行假门测试。',
  projectName: '自动对账助手',
  generatedAt: '2026-10-04T08:00:00.000Z',
  generatedSections: ['背景', '结论与下一步'],
  createdAt: '2026-10-04T08:00:00.000Z',
  updatedAt: '2026-10-04T08:00:00.000Z',
}

describe('renderMarkdown', () => {
  it('renders headings, lists and emphasis', () => {
    const html = renderMarkdown('## 标题\n- **要点**A\n- 要点B')
    expect(html).toContain('<h2>标题</h2>')
    expect(html).toContain('<strong>要点</strong>')
    expect(html).toContain('<li>')
  })

  it('strips script tags and event handlers (AI output is untrusted)', () => {
    const html = renderMarkdown('正文<script>window.alert(1)</script><img src=x onerror="alert(1)">')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onerror')
    expect(html).toContain('正文')
  })

  it('blocks javascript: links but keeps https ones', () => {
    const bad = renderMarkdown('[点我](javascript:alert(1))')
    expect(bad).not.toContain('javascript:')
    const good = renderMarkdown('[文档](https://example.com)')
    expect(good).toContain('href="https://example.com"')
  })
})

describe('isUserEdited / reportMetaLine', () => {
  it('marks edits after generation and labels AI provenance (AC-07)', () => {
    expect(isUserEdited(base)).toBe(false)
    expect(reportMetaLine(base)).toContain('AI 生成于')
    expect(reportMetaLine(base)).toContain('节：背景、结论与下一步')

    const edited = { ...base, updatedAt: '2026-10-05T09:30:00.000Z' }
    expect(isUserEdited(edited)).toBe(true)
    expect(reportMetaLine(edited)).toContain('你已编辑于')
  })

  it('falls back to createdAt for manually created reports', () => {
    const manual = { ...base, generatedAt: null, generatedSections: [] }
    expect(isUserEdited(manual)).toBe(false)
    expect(reportMetaLine(manual)).toContain('手动创建于')
  })
})

describe('reportFileName', () => {
  it('keeps CJK and strips filesystem-unsafe characters', () => {
    expect(reportFileName('宠物鲜食外卖 · 发现报告', 'html')).toBe('宠物鲜食外卖-发现报告.html')
    expect(reportFileName('a/b\\c:d*e?"<>|', 'png')).toBe('a-b-c-d-e.png')
    expect(reportFileName('   ', 'html')).toBe('report.html')
  })
})

describe('buildReportHtmlDocument', () => {
  it('builds a self-contained sanitized document (AC-13)', () => {
    const html = buildReportHtmlDocument(base)
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('charset="utf-8"')
    expect(html).toContain('<style>')
    expect(html).toContain('<title>自动对账助手 · 发现报告</title>')
    expect(html).toContain('项目：自动对账助手')
    expect(html).toContain('由 Discovery Copilot 导出')
    // content rendered as sanitized markdown
    expect(html).toContain('<h2>背景</h2>')
    expect(html).not.toContain('<script')
  })

  it('escapes hostile title text and inlines the brand logo when provided', () => {
    const html = buildReportHtmlDocument({ ...base, title: '<script>x</script>' }, 'data:image/jpeg;base64,abc')
    expect(html).toContain('<title>&lt;script&gt;x&lt;/script&gt;</title>')
    expect(html).toContain('src="data:image/jpeg;base64,abc"')
    expect(html).not.toContain('<script>x</script>')
  })

  it('omits the logo when none is available', () => {
    const html = buildReportHtmlDocument(base, null)
    expect(html).not.toContain('<img')
  })
})
