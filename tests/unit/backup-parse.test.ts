import { describe, expect, it } from 'vitest'
import {
  DCOPILT_FORMAT,
  parseDcopilotFile,
  stableStringify,
} from '@/services/backup'

const t = '2026-10-04T00:00:00.000Z'

const settings = {
  theme: 'dark',
  defaultProviderId: null,
  aiMode: 'relay',
  perRequestBudgetUsd: null,
  monthlyBudgetUsd: null,
  updatedAt: t,
}

const project = {
  id: 'p1',
  name: '项目A',
  description: '',
  status: 'active',
  createdAt: t,
  updatedAt: t,
  deletedAt: null,
}

const assumption = {
  id: 'a1',
  projectId: 'p1',
  type: 'value',
  statement: '中小企业主愿意为自动对账付费',
  impact: 4,
  risk: 4,
  confidence: null,
  priorityScore: 16,
  status: 'open',
  createdAt: t,
  updatedAt: t,
}

const experiment = {
  id: 'e1',
  projectId: 'p1',
  assumptionId: 'a1',
  hypothesis: '若放置假门入口则 25% 以上点击',
  method: '假门测试',
  successCriteria: '点击率 ≥ 25%',
  status: 'planned',
  result: null,
  createdAt: t,
  updatedAt: t,
}

const ostNode = {
  id: 'n1',
  projectId: 'p1',
  type: 'outcome',
  parentId: null,
  title: '对账零负担',
  position: { x: 0, y: 0 },
  linkedAssumptionId: 'a1',
  linkedExperimentId: null,
  createdAt: t,
}

const report = {
  id: 'r1',
  projectId: 'p1',
  title: '发现报告',
  content: '## 背景\n正文',
  generatedAt: null,
  generatedSections: [],
  createdAt: t,
  updatedAt: t,
}

const validFile = {
  format: DCOPILT_FORMAT,
  formatVersion: 1,
  appVersion: '0.1.0',
  exportedAt: t,
  projects: [project],
  assumptions: [assumption],
  experiments: [experiment],
  ostNodes: [ostNode],
  reports: [report],
  settings,
}

describe('stableStringify (§7.4 内容摘要)', () => {
  it('is key-order independent and array-order sensitive', () => {
    expect(stableStringify({ a: 1, b: { d: 2, c: 3 } })).toBe(stableStringify({ b: { c: 3, d: 2 }, a: 1 }))
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]))
    expect(stableStringify(null)).toBe('null')
    expect(stableStringify(undefined as unknown as string)).toBe('null')
  })
})

describe('parseDcopilotFile', () => {
  it('accepts a valid file and normalizes rows', () => {
    const result = parseDcopilotFile(JSON.stringify(validFile))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.file.projects[0]!.name).toBe('项目A')
      expect(result.file.settings?.aiMode).toBe('relay')
      expect(result.file.ostNodes[0]!.position).toEqual({ x: 0, y: 0 })
    }
  })

  it('rejects corrupt JSON and non-object payloads (损坏)', () => {
    expect(parseDcopilotFile('{"format":"disco').ok).toBe(false)
    const arr = parseDcopilotFile('[1,2,3]')
    expect(arr.ok).toBe(false)
    if (!arr.ok) expect(arr.issues.join()).toContain('对象')
  })

  it('enforces the size guard before parsing', () => {
    const result = parseDcopilotFile('{"format":"discovery-copilot"}', { maxBytes: 5 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.join()).toContain('上限')
  })

  it('rejects foreign formats (非法)', () => {
    const result = parseDcopilotFile(JSON.stringify({ ...validFile, format: 'other-app' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.join()).toContain('discovery-copilot')
  })

  it('reports schema violations with field paths (非法)', () => {
    const bad = { ...validFile, projects: [{ ...project, name: '' }] }
    const result = parseDcopilotFile(JSON.stringify(bad))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.join()).toContain('projects.0')
  })

  it('rejects files from a newer app version', () => {
    const result = parseDcopilotFile(JSON.stringify({ ...validFile, formatVersion: 2 }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.join()).toContain('升级')
  })

  it('migrates a v0 file (no reports/settings keys) to v1 (旧版本)', () => {
    const v0: Record<string, unknown> = {
      format: DCOPILT_FORMAT,
      formatVersion: 0,
      appVersion: '0.0.9',
      exportedAt: t,
      projects: [project],
      assumptions: [assumption],
      experiments: [],
      ostNodes: [],
    }
    const result = parseDcopilotFile(JSON.stringify(v0))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.file.formatVersion).toBe(1)
      expect(result.file.reports).toEqual([])
      expect(result.file.settings).toBeNull()
    }
  })

  it('rejects duplicate ids inside the file (§7.4 ④)', () => {
    const dup = { ...validFile, projects: [project, { ...project }] }
    const result = parseDcopilotFile(JSON.stringify(dup))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.join()).toContain('重复 id')
  })

  it('rejects broken references (assumption → missing project)', () => {
    const broken = { ...validFile, assumptions: [{ ...assumption, projectId: 'pX' }] }
    const result = parseDcopilotFile(JSON.stringify(broken))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.join()).toContain('引用的项目不在文件内')
  })

  it('rejects cross-project references (experiment → other project assumption)', () => {
    const other = { ...project, id: 'p2' }
    const foreignExp = { ...experiment, assumptionId: 'a-other' }
    const broken = {
      ...validFile,
      projects: [project, other],
      assumptions: [assumption, { ...assumption, id: 'a-other', projectId: 'p2' }],
      experiments: [foreignExp],
    }
    const result = parseDcopilotFile(JSON.stringify(broken))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.join()).toContain('其他项目的假设')
  })
})
