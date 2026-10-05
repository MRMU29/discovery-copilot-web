import { describe, it, expect, afterAll } from 'vitest'
import 'fake-indexeddb/auto'
import Dexie from 'dexie'

/**
 * Pre-validation probe ③ — 20 MB-class .dcopilot import stress (plan v2.1 §14-③, §5.4).
 *
 * Generates a payload at the plan's declared capacity ceilings (50 projects ×
 * 200 assumptions / 300 OST nodes / 100 experiments / 20 reports), asserts the
 * serialized size reaches the 20 MB class, then:
 *   a) imports it inside a single IndexedDB transaction and reports timing;
 *   b) poisons the same 20 MB-class import with a non-cloneable record and
 *      proves the transaction rolls back completely — no "projects arrived,
 *      experiments vanished" half-import state (§7.5).
 *
 * This is a probe, not the real db layer: the schema below is deliberately
 * local to this file and gets replaced by src/db in command 2.
 */

const PROJECTS = 50
const ASSUMPTIONS_PER = 200
const OST_PER = 300
const EXPERIMENTS_PER = 100
const REPORTS_PER = 20
const TARGET_BYTES = 20 * 1024 * 1024

const REPORT_BODY =
  '发现报告正文占位：覆盖想法概述、假设清单、优先级矩阵、实验计划、机会解决方案树与下一步建议。' +
  '本地优先架构下报告内容随 .dcopilot 文件迁移，本段重复文本用于逼近计划书声明的 20 MB 级单文件导入边界。'

function makePayload() {
  const projects = []
  const assumptions = []
  const experiments = []
  const ostNodes = []
  const reports = []
  for (let p = 0; p < PROJECTS; p++) {
    const projectId = `proj-${String(p).padStart(3, '0')}`
    projects.push({
      id: projectId,
      name: `项目 ${p} — 本地优先产品发现工作台`,
      description: '无账号、默认本地保存、支持 BYOK 与跨设备文件迁移的产品发现工作台。',
      status: 'active',
      createdAt: '2026-10-03T00:00:00.000Z',
      updatedAt: '2026-10-03T00:00:00.000Z',
    })
    for (let a = 0; a < ASSUMPTIONS_PER; a++) {
      assumptions.push({
        id: `${projectId}-asm-${a}`,
        projectId,
        type: a % 8,
        statement: `假设 ${a}：目标用户在移动场景下愿意为离线优先的发现工作台付出切换成本。`,
        impact: (a % 5) + 1,
        risk: ((a + 2) % 5) + 1,
        confidence: a % 2 === 0 ? null : (a % 10) / 10,
        priorityScore: 0,
        status: 'open',
        createdAt: '2026-10-03T00:00:00.000Z',
      })
    }
    for (let o = 0; o < OST_PER; o++) {
      ostNodes.push({
        id: `${projectId}-ost-${o}`,
        projectId,
        type: ['outcome', 'opportunity', 'solution', 'experiment'][o % 4],
        parentId: o === 0 ? null : `${projectId}-ost-${o - 1}`,
        title: `节点 ${o}：把模糊创意整理为可验证的发现结构`,
        position: { x: (o % 12) * 180, y: Math.floor(o / 12) * 120 },
      })
    }
    for (let e = 0; e < EXPERIMENTS_PER; e++) {
      experiments.push({
        id: `${projectId}-exp-${e}`,
        projectId,
        assumptionId: `${projectId}-asm-${e}`,
        hypothesis: `实验 ${e}：着陆页转化率 ≥ 8% 即视为价值假设得到初步支持。`,
        method: 'landing-page-smoke',
        successCriteria: '7 日内转化率 ≥ 8% 且样本 ≥ 300',
        status: 'planned',
        result: null,
      })
    }
    for (let r = 0; r < REPORTS_PER; r++) {
      reports.push({
        id: `${projectId}-rep-${r}`,
        projectId,
        title: `发现报告 ${r}`,
        content: REPORT_BODY.repeat(3),
        generatedAt: '2026-10-03T00:00:00.000Z',
      })
    }
  }
  return { format: 'discovery-copilot', formatVersion: 1, projects, assumptions, experiments, ostNodes, reports }
}

type ProbePayload = ReturnType<typeof makePayload>

function padToTargetMb(payload: ProbePayload): number {
  let bytes = JSON.stringify(payload).length
  if (bytes < TARGET_BYTES) {
    const extra = ' padding-for-20mb-stress-probe'
    const deficit = TARGET_BYTES - bytes
    payload.reports[payload.reports.length - 1].content += extra.repeat(Math.ceil(deficit / extra.length) + 1)
    bytes = JSON.stringify(payload).length
  }
  return bytes
}

type Row = Record<string, unknown>
interface ProbeDb extends Dexie {
  projects: Dexie.Table<Row, string>
  assumptions: Dexie.Table<Row, string>
  experiments: Dexie.Table<Row, string>
  ost_nodes: Dexie.Table<Row, string>
  reports: Dexie.Table<Row, string>
}

const db = new Dexie('probe-stress-valid') as ProbeDb
db.version(1).stores({
  projects: 'id',
  assumptions: 'id, projectId',
  experiments: 'id, projectId, assumptionId',
  ost_nodes: 'id, projectId',
  reports: 'id, projectId',
})

const rollbackDb = new Dexie('probe-stress-rollback') as ProbeDb
rollbackDb.version(1).stores({
  projects: 'id',
  assumptions: 'id, projectId',
  experiments: 'id, projectId',
  ost_nodes: 'id, projectId',
  reports: 'id, projectId',
})

const tablesOf = (d: ProbeDb) => [d.projects, d.assumptions, d.experiments, d.ost_nodes, d.reports]

async function importAll(d: ProbeDb, payload: ProbePayload) {
  const [projects, assumptions, experiments, ostNodes, reports] = tablesOf(d)
  await d.transaction('rw', tablesOf(d), async () => {
    await projects.bulkPut(payload.projects)
    await assumptions.bulkPut(payload.assumptions)
    await experiments.bulkPut(payload.experiments)
    await ostNodes.bulkPut(payload.ostNodes)
    await reports.bulkPut(payload.reports)
  })
}

// Built once and shared: generation + padding costs several seconds and every
// test below needs the identical 20 MB-class payload.
const sharedPayload: ProbePayload = makePayload()
const sharedSize = padToTargetMb(sharedPayload)

describe('probe ③ — 20 MB-class .dcopilot import', () => {
  it('reaches the 20 MB class at plan capacity ceilings', () => {
    expect(sharedPayload.projects.length).toBe(PROJECTS)
    expect(sharedPayload.assumptions.length).toBe(PROJECTS * ASSUMPTIONS_PER)
    console.log(
      `[probe] payload: ${sharedPayload.projects.length} projects, ${sharedPayload.assumptions.length} assumptions, ` +
        `${sharedPayload.ostNodes.length} OST nodes, ${sharedPayload.experiments.length} experiments, ` +
        `${sharedPayload.reports.length} reports → ${(sharedSize / 1024 / 1024).toFixed(2)} MB JSON`,
    )
    expect(sharedSize).toBeGreaterThanOrEqual(TARGET_BYTES)
  })

  it('imports the full payload in one transaction within the sanity bound', async () => {
    const started = performance.now()
    await importAll(db, sharedPayload)
    const elapsed = performance.now() - started
    console.log(`[probe] full import: ${elapsed.toFixed(0)} ms`)
    expect(elapsed).toBeLessThan(60_000) // sanity bound; real KPI is the logged number

    expect(await db.projects.count()).toBe(PROJECTS)
    expect(await db.assumptions.count()).toBe(PROJECTS * ASSUMPTIONS_PER)
    expect(await db.ost_nodes.count()).toBe(PROJECTS * OST_PER)
    expect(await db.experiments.count()).toBe(PROJECTS * EXPERIMENTS_PER)
    expect(await db.reports.count()).toBe(PROJECTS * REPORTS_PER)
  }, 120_000)

  it('rolls back completely when a record fails mid-transaction', async () => {
    const [projects, assumptions, experiments, ostNodes, reports] = tablesOf(rollbackDb)

    await expect(
      rollbackDb.transaction('rw', tablesOf(rollbackDb), async () => {
        await projects.bulkPut(sharedPayload.projects)
        await assumptions.bulkPut(sharedPayload.assumptions)
        await experiments.bulkPut(sharedPayload.experiments)
        await ostNodes.bulkPut(sharedPayload.ostNodes)
        // A function value cannot be structured-cloned → DataCloneError mid-transaction.
        await reports.bulkPut([...sharedPayload.reports, { id: 'poisoned', projectId: 'x', content: () => {} }])
      }),
    ).rejects.toThrow()

    expect(await rollbackDb.projects.count()).toBe(0)
    expect(await rollbackDb.assumptions.count()).toBe(0)
    expect(await rollbackDb.experiments.count()).toBe(0)
    expect(await rollbackDb.ost_nodes.count()).toBe(0)
    expect(await rollbackDb.reports.count()).toBe(0)
  }, 120_000)

  afterAll(async () => {
    await db.delete()
    await rollbackDb.delete()
  })
})
