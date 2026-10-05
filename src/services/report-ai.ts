import { z } from 'zod'
import { buildReportPrompt } from '@/ai/prompts/builders'
import { resolvePricing } from '@/ai/pricing'
import { runAi } from '@/ai/run'
import type { AIProvider, GenerateJSONResult } from '@/ai/types'
import { assumptionsRepo, experimentsRepo, ostRepo, projectsRepo } from '@/db/repositories'
import { ASSUMPTION_TYPE_META, STATUS_META } from '@/lib/assumption-meta'
import { nowIso } from '@/lib/clock'
import { DomainError } from '@/lib/errors'
import type { OstNode } from '@/schemas/entities'
import { createReport, getReport, updateReport } from './reports'
import type { Report } from '@/schemas/entities'

/**
 * Report generation aggregates ONLY what the user has already confirmed
 * (assumption scores, experiment results, OST structure) — the model's job is
 * structuring and prose, never inventing facts (prompt hard rule). The draft
 * lands in the review dialog; applyReportDraft stamps generatedAt/sections so
 * the UI can tell AI content apart from user edits (AC-07).
 */

const reportDraftSchema = z.object({
  title: z.string().min(1).max(200),
  sections: z.array(z.string().min(1).max(60)).min(1).max(12),
  content: z.string().min(1).max(100_000),
})

/**
 * Long-form output makes models wrap the payload; accept both the flat draft
 * and a {"report": …} envelope, normalize to the flat shape.
 */
export const reportResultSchema = z.union([reportDraftSchema, z.object({ report: reportDraftSchema })]).transform(
  (value) => ('report' in value ? value.report : value),
)

export type ReportDraft = z.infer<typeof reportDraftSchema>

/** generatedSections ground truth = the ## headings actually present in content. */
export function deriveSections(content: string): string[] {
  const headings = [...content.matchAll(/^##\s+(.+?)\s*$/gm)].map((m) => m[1]!.trim())
  return [...new Set(headings)].filter((s) => s.length > 0 && s.length <= 60).slice(0, 12)
}

const CONTEXT_MIN_CHARS = 20

// Prompt-context labels kept local (services must not import from pages/):
// display metadata lives in src/pages/*/-meta.ts, these are the plain labels.
const EXPERIMENT_STATUS_LABELS = {
  planned: '待执行',
  running: '进行中',
  completed: '已完成',
  dropped: '已放弃',
} as const

const OST_TYPE_LABELS = {
  outcome: '目标结果',
  opportunity: '机会痛点',
  solution: '解决方案',
  experiment: '验证实验',
} as const

/**
 * Aggregates the project's confirmed discovery data into one prompt context
 * block. Ordering tells the story: assumptions by priority score, then
 * experiments, then the OST tree — the report reads in the same order.
 */
export async function buildReportContext(projectId: string): Promise<string> {
  const project = await projectsRepo.get(projectId)
  if (!project || project.deletedAt) {
    throw new DomainError('NOT_FOUND', `项目不存在或已在回收站: ${projectId}`)
  }
  const [assumptions, experiments, nodes] = await Promise.all([
    assumptionsRepo.byProject(projectId),
    experimentsRepo.byProject(projectId),
    ostRepo.byProject(projectId),
  ])

  const blocks: string[] = []
  blocks.push(
    `### 项目\n名称：${project.name}${project.description ? `\n描述：${project.description}` : ''}`,
  )

  if (assumptions.length > 0) {
    const lines = [...assumptions]
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .map((a) => {
        const confidence = a.confidence === null ? '未评估' : `${Math.round(a.confidence * 100)}%`
        const type = ASSUMPTION_TYPE_META[a.type]?.label ?? a.type
        const status = STATUS_META[a.status]?.label ?? a.status
        return `- [${type}] ${a.statement}（影响 ${a.impact} / 风险 ${a.risk} / 信心 ${confidence} / 优先分 ${a.priorityScore.toFixed(2)} / 状态：${status}）`
      })
    blocks.push(`### 关键假设（按优先分降序）\n${lines.join('\n')}`)
  }

  if (experiments.length > 0) {
    const assumptionById = new Map(assumptions.map((a) => [a.id, a] as const))
    const lines = experiments.map((e) => {
      const linked = e.assumptionId ? (assumptionById.get(e.assumptionId)?.statement ?? null) : null
      const status = EXPERIMENT_STATUS_LABELS[e.status] ?? e.status
      const parts = [
        linked ? `针对假设「${linked}」` : '未关联假设',
        e.hypothesis,
        `方法：${e.method}`,
        e.successCriteria ? `成功标准：${e.successCriteria}` : null,
        `状态：${status}`,
        e.result ? `结果：${e.result}` : null,
      ].filter((p): p is string => p !== null)
      return `- ${parts.join('｜')}`
    })
    blocks.push(`### 验证实验\n${lines.join('\n')}`)
  }

  if (nodes.length > 0) {
    blocks.push(`### 机会解决方案树\n${renderOstTree(nodes)}`)
  }

  return blocks.join('\n\n')
}

function renderOstTree(nodes: OstNode[]): string {
  const childrenOf = new Map<string | null, OstNode[]>()
  for (const node of nodes) {
    const key = node.parentId && nodes.some((n) => n.id === node.parentId) ? node.parentId : null
    const list = childrenOf.get(key) ?? []
    list.push(node)
    childrenOf.set(key, list)
  }
  const lines: string[] = []
  const walk = (parentId: string | null, depth: number) => {
    for (const node of childrenOf.get(parentId) ?? []) {
      lines.push(`${'  '.repeat(depth)}- ${OST_TYPE_LABELS[node.type]}：${node.title}`)
      walk(node.id, depth + 1)
    }
  }
  walk(null, 0)
  return lines.join('\n')
}

export interface ReportGenerateOptions {
  projectId: string
  projectName?: string
  /** buildReportContext 产物（对话框与 BYOK/Relay 两条路径共享一次聚合）。 */
  context: string
  signal?: AbortSignal
  /** §6.4 熔断确认后的单次绕过（UI「本次继续」）。 */
  budgetConfirmed?: boolean
}

export async function generateReport(
  provider: AIProvider,
  options: ReportGenerateOptions,
): Promise<GenerateJSONResult<ReportDraft>> {
  const context = options.context.trim()
  if (context.length < CONTEXT_MIN_CHARS) {
    throw new Error('项目数据还太少：先录入假设或实验，再生成报告。')
  }

  const bundle = buildReportPrompt({ projectName: options.projectName, context })

  const result = await runAi(provider, {
    kind: 'json',
    schema: reportResultSchema,
    systemPrompt: bundle.instruction,
    promptId: 'generate-report',
    promptVersion: bundle.version,
    messages: [{ role: 'user', content: bundle.inputBlock }],
    temperature: 0.5,
    maxTokens: 4096,
    pricing: resolvePricing(provider.config.model) ?? undefined,
    projectId: options.projectId,
    signal: options.signal,
    budgetConfirmed: options.budgetConfirmed,
  })
  return { data: result.data, usage: result.usage, attempts: result.attempts }
}

/**
 * Persists the reviewed draft, stamped with generation provenance. Without
 * existingReportId this creates a NEW report; with one it overwrites that
 * report in place (AI 重写 — same id, refreshed generatedAt/sections). User
 * tweaks made in the preview win: sections are re-derived from the (possibly
 * edited) content, falling back to the model's list.
 */
export async function applyReportDraft(
  projectId: string,
  draft: ReportDraft,
  existingReportId?: string,
): Promise<Report> {
  const sections = deriveSections(draft.content)
  const generatedSections = sections.length > 0 ? sections : draft.sections
  const generatedAt = nowIso()
  if (!existingReportId) {
    return createReport(projectId, {
      title: draft.title,
      content: draft.content,
      generatedAt,
      generatedSections,
    })
  }
  const existing = await getReport(existingReportId)
  if (existing.projectId !== projectId) {
    throw new DomainError('INTEGRITY', '目标报告不属于当前项目')
  }
  return updateReport(existingReportId, {
    title: draft.title,
    content: draft.content,
    generatedAt,
    generatedSections,
  })
}
