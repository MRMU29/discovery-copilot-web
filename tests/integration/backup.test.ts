import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, resetDb } from '@/db/db'
import { snapshotsRepo } from '@/db/repositories'
import { CAPS } from '@/lib/limits'
import type { DcopilotFile } from '@/services/backup'
import {
  applyImport,
  buildDcopilotFile,
  createSnapshot,
  parseDcopilotFile,
  summarizeImport,
} from '@/services/backup'
import { createAssumption } from '@/services/assumptions'
import { createExperiment } from '@/services/experiments'
import { createOstNode } from '@/services/ost'
import { createProject, updateProject } from '@/services/projects'
import { createReport } from '@/services/reports'
import { getSettings, updateSettings } from '@/services/settings'

beforeEach(async () => {
  await resetDb()
})

afterEach(() => {
  vi.restoreAllMocks()
})

const t = '2026-10-04T00:00:00.000Z'

async function seedFullProject(name = '项目A') {
  const project = await createProject({ name, description: '描述A' })
  const a1 = await createAssumption(project.id, {
    statement: '中小企业主愿意为自动对账付费',
    type: 'value',
    impact: 4,
    risk: 4,
    confidence: null,
  })
  const e1 = await createExperiment(project.id, {
    assumptionId: a1.id,
    hypothesis: '若放置假门入口则 25% 以上点击',
    method: '假门测试',
    successCriteria: '点击率 ≥ 25%',
    status: 'planned',
  })
  await createOstNode(project.id, {
    type: 'outcome',
    parentId: null,
    title: '对账零负担',
    position: { x: 0, y: 0 },
    linkedAssumptionId: a1.id,
  })
  await createReport(project.id, {
    title: '发现报告',
    content: '## 背景\n正文',
    generatedAt: null,
    generatedSections: [],
  })
  return { project, a1, e1 }
}

const newProjectFile = (): DcopilotFile =>
  ({
    format: 'discovery-copilot',
    formatVersion: 1,
    appVersion: '0.1.0',
    exportedAt: t,
    projects: [
      {
        id: 'p-new',
        name: '全新项目',
        description: '',
        status: 'active',
        createdAt: t,
        updatedAt: t,
        deletedAt: null,
      },
    ],
    assumptions: [],
    experiments: [],
    ostNodes: [],
    reports: [],
    settings: null,
  }) as DcopilotFile

describe('buildDcopilotFile (导出 · AC-08)', () => {
  it('exports §7.2 shape with settings, excluding non-portable tables', async () => {
    const { project } = await seedFullProject()
    await updateSettings({ aiMode: 'byok' })
    await db.ai_requests.bulkPut([
      {
        id: 1,
        providerId: 'prov',
        projectId: project.id,
        model: 'm',
        kind: 'json',
        promptId: 'p',
        promptVersion: '1.0.0',
        inputTokens: 1,
        outputTokens: 1,
        estimatedUsd: null,
        status: 'ok',
        errorCode: null,
        durationMs: 5,
        createdAt: t,
      },
    ])

    const file = await buildDcopilotFile('all')
    expect(file.format).toBe('discovery-copilot')
    expect(file.formatVersion).toBe(1)
    expect(file.appVersion.length).toBeGreaterThan(0)
    expect(file.projects).toHaveLength(1)
    expect(file.assumptions).toHaveLength(1)
    expect(file.experiments).toHaveLength(1)
    expect(file.ostNodes).toHaveLength(1)
    expect(file.reports).toHaveLength(1)
    expect(file.settings?.aiMode).toBe('byok')

    const keys = Object.keys(file)
    expect(keys).not.toContain('score_events')
    expect(keys).not.toContain('ai_requests')
    expect(keys).not.toContain('ai_providers')
    // §6.3/命令 7 约定：onboarding 行与 Key 均不出现在导出里
    expect(JSON.stringify(file)).not.toContain('onboarding')
  })

  it('scopes a single-project export to that project only', async () => {
    const a = await seedFullProject('项目A')
    await createProject({ name: '项目B' })

    const file = await buildDcopilotFile(a.project.id)
    expect(file.projects).toHaveLength(1)
    expect(file.projects[0]!.name).toBe('项目A')
    for (const row of [...file.assumptions, ...file.experiments, ...file.ostNodes, ...file.reports]) {
      expect(row.projectId).toBe(a.project.id)
    }
  })
})

describe('applyImport (§7.3-7.5)', () => {
  it('restores a wiped device via round-trip (合法)', async () => {
    await seedFullProject()
    await updateSettings({ aiMode: 'byok' })
    const fileText = JSON.stringify(await buildDcopilotFile('all'))

    await resetDb()
    const parsed = parseDcopilotFile(fileText)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const result = await applyImport(parsed.file, { conflictStrategy: 'copy', restoreSettings: true })

    expect(result).toMatchObject({ created: 1, overwritten: 0, skipped: 0, settingsRestored: true })
    expect(await db.projects.count()).toBe(1)
    expect(await db.assumptions.count()).toBe(1)
    expect(await db.experiments.count()).toBe(1)
    expect(await db.ost_nodes.count()).toBe(1)
    expect(await db.reports.count()).toBe(1)
    expect((await getSettings()).aiMode).toBe('byok')
    // FK 完整性：实验/OST 的引用在导入后可解析
    const experiment = (await db.experiments.toArray())[0]!
    expect(await db.assumptions.get(experiment.assumptionId!)).toBeTruthy()
    const node = (await db.ost_nodes.toArray())[0]!
    expect(await db.assumptions.get(node.linkedAssumptionId!)).toBeTruthy()
  })

  it('skips identical re-imports as duplicates (重复)', async () => {
    await seedFullProject()
    const parsed = parseDcopilotFile(JSON.stringify(await buildDcopilotFile('all')))
    if (!parsed.ok) throw new Error('parse failed')

    const result = await applyImport(parsed.file, { conflictStrategy: 'copy', restoreSettings: false })
    expect(result.created).toBe(0)
    expect(result.skipped).toBe(1)
    expect(result.duplicates).toBe(1)
    expect(await db.projects.count()).toBe(1)
  })

  it('handles the three conflict strategies (冲突)', async () => {
    const { project, a1 } = await seedFullProject()
    const parsed = parseDcopilotFile(JSON.stringify(await buildDcopilotFile('all')))
    if (!parsed.ok) throw new Error('parse failed')
    const file = parsed.file

    // 本地演化 → 与文件冲突
    await updateProject(project.id, { name: '本地改名' })
    const summary = await summarizeImport(file)
    expect(summary.counts.conflict).toBe(1)

    // 覆盖：本地整体替换为文件内容，且自动生成快照
    const overwrite = await applyImport(file, { conflictStrategy: 'overwrite', restoreSettings: false })
    expect(overwrite.overwritten).toBe(1)
    expect(overwrite.snapshotId).not.toBeNull()
    expect((await db.projects.get(project.id))?.name).toBe('项目A')
    expect(await db.snapshots.count()).toBe(1)
    // 覆盖后子行与文件一致（删除重建）
    expect(await db.assumptions.where('projectId').equals(project.id).count()).toBe(1)

    // 改名制造冲突 → 副本：新项目 id、子行全部重发 id 且 FK 重映射、原项目不动
    await updateProject(project.id, { name: '再次改名' })
    const copy = await applyImport(file, { conflictStrategy: 'copy', restoreSettings: false })
    expect(copy.created).toBe(1)
    expect(await db.projects.count()).toBe(2)
    const copyProject = (await db.projects.toArray()).find((p) => p.id !== project.id)!
    expect(copyProject.name).toBe('项目A')
    const copyAssumptions = await db.assumptions.where('projectId').equals(copyProject.id).toArray()
    expect(copyAssumptions).toHaveLength(1)
    expect(copyAssumptions[0]!.id).not.toBe(a1.id)
    const copyExperiments = await db.experiments.where('projectId').equals(copyProject.id).toArray()
    expect(copyExperiments[0]!.assumptionId).toBe(copyAssumptions[0]!.id)
    // 原项目未动
    expect((await db.projects.get(project.id))?.name).toBe('再次改名')
    expect(await db.assumptions.get(a1.id)).toBeTruthy()

    // 跳过：本地保持
    const skip = await applyImport(file, { conflictStrategy: 'skip', restoreSettings: false })
    expect(skip.skipped).toBe(1)
    expect((await db.projects.get(project.id))?.name).toBe('再次改名')
  })

  it('flags same-name different-id projects without blocking (§7.4 ③)', async () => {
    const { project } = await seedFullProject()
    const parsed = parseDcopilotFile(JSON.stringify(await buildDcopilotFile('all')))
    if (!parsed.ok) throw new Error('parse failed')
    const renamed: DcopilotFile = {
      ...parsed.file,
      projects: [{ ...parsed.file.projects[0]!, id: 'p-renamed' }],
      assumptions: [],
      experiments: [],
      ostNodes: [],
      reports: [],
    }
    const summary = await summarizeImport(renamed)
    expect(summary.counts.new).toBe(1)
    expect(summary.items[0]!.sameName).toBe(true)
    expect(summary.items[0]!.project.name).toBe((await db.projects.get(project.id))!.name)
  })

  it('rejects when the import would exceed CAPS.projects', async () => {
    const seeds = Array.from({ length: CAPS.projects }, (_, i) => ({
      id: `seed-${i}`,
      name: `项目 ${i}`,
      description: '',
      status: 'active' as const,
      createdAt: t,
      updatedAt: t,
      deletedAt: null,
    }))
    await db.projects.bulkPut(seeds)
    await expect(
      applyImport(newProjectFile(), { conflictStrategy: 'copy', restoreSettings: false }),
    ).rejects.toMatchObject({ code: 'CAPACITY_LIMIT' })
  })

  it('rolls back the whole transaction on a mid-apply failure (回滚)', async () => {
    await seedFullProject()
    const fileText = JSON.stringify(await buildDcopilotFile('all'))
    await resetDb()

    const parsed = parseDcopilotFile(fileText)
    if (!parsed.ok) throw new Error('parse failed')
    vi.spyOn(db.reports, 'bulkPut').mockRejectedValueOnce(new Error('boom'))
    await expect(
      applyImport(parsed.file, { conflictStrategy: 'copy', restoreSettings: false }),
    ).rejects.toThrowError('boom')
    // 无半导入状态：全部回滚
    expect(await db.projects.count()).toBe(0)
    expect(await db.assumptions.count()).toBe(0)
    expect(await db.reports.count()).toBe(0)
  })

  it('restores settings only when asked', async () => {
    await seedFullProject()
    await updateSettings({ aiMode: 'byok' })
    const parsed = parseDcopilotFile(JSON.stringify(await buildDcopilotFile('all')))
    if (!parsed.ok) throw new Error('parse failed')
    await resetDb()

    const result = await applyImport(parsed.file, { conflictStrategy: 'copy', restoreSettings: false })
    expect(result.settingsRestored).toBe(false)
    expect((await getSettings()).aiMode).toBe('relay')
  })
})

describe('snapshots (§7.6)', () => {
  it('keeps at most 3, newest first', async () => {
    for (let i = 0; i < 5; i++) {
      await createSnapshot()
    }
    const rows = await snapshotsRepo.list()
    expect(rows).toHaveLength(3)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]!.createdAt >= rows[i]!.createdAt).toBe(true)
    }
  })

  it('deletes a single snapshot on demand', async () => {
    await createSnapshot()
    await createSnapshot()
    const all = await snapshotsRepo.list()
    expect(all).toHaveLength(2)
    // 同毫秒创建的两份快照排序不稳定——只断言删除的是被删者、剩余的是另一份
    const doomed = all[0]!.id
    await snapshotsRepo.delete(doomed)
    const after = await snapshotsRepo.list()
    expect(after).toHaveLength(1)
    expect(after[0]!.id).not.toBe(doomed)
    await expect(snapshotsRepo.delete('missing-id')).resolves.toBeUndefined()
  })

  it('can restore from a snapshot payload through the same pipeline', async () => {
    await seedFullProject()
    const snapshot = await createSnapshot()
    const parsed = parseDcopilotFile(snapshot.payload)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const result = await applyImport(parsed.file, { conflictStrategy: 'skip', restoreSettings: false })
    expect(result.duplicates).toBe(1)
  })
})
