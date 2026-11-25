// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  assumptionSchema,
  experimentSchema,
  ostNodeSchema,
  projectSchema,
  reportSchema,
} from '@/schemas/entities'
import {
  PACKAGE_MAX_BYTES,
  buildProjectPackageDocument,
  packageFileName,
} from '@/lib/project-export'

const TS = '2026-11-25T00:00:00.000Z'

const project = projectSchema.parse({
  id: 'p1',
  name: '<script>alert(1)</script> 记账',
  description: '面向自由职业者',
  createdAt: TS,
  updatedAt: TS,
})

const assumption = assumptionSchema.parse({
  id: 'a1',
  projectId: 'p1',
  type: 'value',
  statement: '<b>愿意付费</b>',
  impact: 4,
  risk: 5,
  priorityScore: 20,
  createdAt: TS,
  updatedAt: TS,
})

const experiment = experimentSchema.parse({
  id: 'e1',
  projectId: 'p1',
  hypothesis: '若提供模板则完成率上升',
  method: '假门测试',
  status: 'completed',
  outcome: 'supported',
  metric: '点击率',
  actualValue: '28%',
  createdAt: TS,
  updatedAt: TS,
})

const report = reportSchema.parse({
  id: 'r1',
  projectId: 'p1',
  title: '发现报告',
  content: '## 背景\n正文 **加粗**\n\n## 结论\n下一步',
  generatedAt: TS,
  generatedSections: ['背景', '结论'],
  createdAt: TS,
  updatedAt: TS,
})

function node(id: string, x: number, y: number, parentId: string | null = null) {
  return ostNodeSchema.parse({
    id,
    projectId: 'p1',
    type: parentId ? 'solution' : 'outcome',
    parentId,
    title: `节点 ${id}`,
    position: { x, y },
    createdAt: TS,
  })
}

describe('buildProjectPackageDocument', () => {
  it('escapes user text and keeps a locked-down CSP', () => {
    const html = buildProjectPackageDocument({
      project,
      assumptions: [assumption],
      experiments: [experiment],
      ostNodes: [],
      reports: [report],
    })
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; 记账')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;b&gt;愿意付费&lt;/b&gt;')
    expect(html).toContain("default-src 'none'")
  })

  it('references nothing external (only inline styles and data: images)', () => {
    const html = buildProjectPackageDocument({
      project,
      assumptions: [assumption],
      experiments: [],
      ostNodes: [node('n1', 0, 0)],
      reports: [],
    })
    expect(html).not.toMatch(/(?:src|href)="https?:/i)
    expect(html).not.toMatch(/<script/i)
  })

  it('renders report markdown through the sanitizer', () => {
    const html = buildProjectPackageDocument({
      project,
      assumptions: [],
      experiments: [],
      ostNodes: [],
      reports: [report],
    })
    expect(html).toContain('<h2>背景</h2>')
    expect(html).toContain('<strong>加粗</strong>')
  })

  it('falls back to a grid when every OST node sits at (0,0)', () => {
    const html = buildProjectPackageDocument({
      project,
      assumptions: [],
      experiments: [],
      ostNodes: [node('n1', 0, 0), node('n2', 0, 0)],
      reports: [],
    })
    const xs = [...html.matchAll(/<rect x="(\d+)"/g)].map((m) => Number(m[1]))
    expect(xs).toHaveLength(2)
    expect(new Set(xs).size).toBe(2) // cannot overlap
  })

  it('draws one edge per parent link', () => {
    const html = buildProjectPackageDocument({
      project,
      assumptions: [],
      experiments: [],
      ostNodes: [node('n1', 0, 0), node('n2', 0, 200, 'n1')],
      reports: [],
    })
    expect((html.match(/<path d="M/g) ?? []).length).toBe(1)
  })

  it('shows empty-state copy instead of empty tables', () => {
    const html = buildProjectPackageDocument({
      project,
      assumptions: [],
      experiments: [],
      ostNodes: [],
      reports: [],
    })
    expect(html).toContain('pkg-empty')
    expect(html).not.toContain('<table class="pkg-table"')
  })
})

describe('packageFileName', () => {
  it('strips filesystem-hostile characters and keeps CJK', () => {
    expect(packageFileName('宠物/鲜食:外卖')).toBe('宠物-鲜食-外卖-package.html')
  })

  it('falls back when the name is only punctuation', () => {
    expect(packageFileName('///')).toBe('project-package.html')
  })
})

describe('PACKAGE_MAX_BYTES', () => {
  it('is the documented 2 MB ceiling', () => {
    expect(PACKAGE_MAX_BYTES).toBe(2 * 1024 * 1024)
  })
})
