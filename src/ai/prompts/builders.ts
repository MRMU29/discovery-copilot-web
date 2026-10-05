import { ASSUMPTION_TYPE_META } from '@/lib/assumption-meta'
import {
  DESIGN_EXPERIMENTS_PROMPT,
  GENERATE_REPORT_PROMPT,
  IDENTIFY_ASSUMPTIONS_PROMPT,
  getPrompt,
} from './index'

/**
 * Prompt builder（Prompt Relay 需求「模板三共享」）：BYOK 与 Relay 共用同一
 * 份 instruction——BYOK 把 instruction 作为 system、inputBlock 作为 user 消息；
 * Relay 把 relayText（指令 + 输入数据 + few-shot 示例）整段交给用户复制。
 * 注册表保持版本化（registerPrompt），builder 只做组装不改指令源。
 */

export interface PromptBundle {
  id: string
  version: string
  /** BYOK system instruction — 与 relayText 共享同一指令核心。 */
  instruction: string
  /** 任务输入数据块（BYOK 的 user 消息 / relayText 的内联部分）。 */
  inputBlock: string
  /** Relay 全文：指令 + 输入数据 + 输出规则 + few-shot 示例。 */
  relayText: string
}

const OUTPUT_RULE = '只输出一个 JSON 对象，不要任何解释、Markdown 代码块或额外文本。'

function composeRelayText(instruction: string, inputBlock: string, example: string): string {
  return [
    instruction,
    '',
    '## 待处理输入',
    inputBlock,
    '',
    '## 输出示例（仅示意格式，数值仅供参照）',
    example,
    '',
    `## 最后强调\n${OUTPUT_RULE}`,
  ].join('\n')
}

export interface IdentifyPromptInput {
  projectName?: string
  context: string
}

export function buildIdentifyPrompt(input: IdentifyPromptInput): PromptBundle {
  const instruction = IDENTIFY_ASSUMPTIONS_PROMPT.template
  const parts: string[] = []
  if (input.projectName) parts.push(`项目名称：${input.projectName}`)
  parts.push(`项目背景与想法：\n${input.context.trim().slice(0, 8000)}`)
  const inputBlock = parts.join('\n\n')
  return {
    id: IDENTIFY_ASSUMPTIONS_PROMPT.id,
    version: IDENTIFY_ASSUMPTIONS_PROMPT.version,
    instruction,
    inputBlock,
    relayText: composeRelayText(
      instruction,
      inputBlock,
      '{"assumptions":[{"statement":"自由职业者愿意为自动报税整理支付每月 10 元","type":"value","rationale":"付费意愿未经验证","suggestedImpact":4,"suggestedRisk":4}]}',
    ),
  }
}

export interface ExperimentPromptAssumption {
  statement: string
  type: string
  impact: number
  risk: number
  confidence: number | null
}

export interface ExperimentPromptInput {
  projectName?: string
  assumption: ExperimentPromptAssumption
  context?: string
}

export function buildExperimentPrompt(input: ExperimentPromptInput): PromptBundle {
  const instruction = getPrompt(DESIGN_EXPERIMENTS_PROMPT.id, DESIGN_EXPERIMENTS_PROMPT.version).template
  const a = input.assumption
  const lines = [
    `假设陈述：${a.statement}`,
    `风险类别：${a.type}（${ASSUMPTION_TYPE_META[a.type as keyof typeof ASSUMPTION_TYPE_META]?.label ?? a.type}）`,
    `影响 ${a.impact} / 风险 ${a.risk} / 信心 ${a.confidence === null ? '未评估' : `${Math.round(a.confidence * 100)}%`}`,
  ]
  const parts = []
  if (input.projectName) parts.push(`项目名称：${input.projectName}`)
  parts.push(`## 待验证假设\n${lines.join('\n')}`)
  if (input.context?.trim()) parts.push(`## 补充背景\n${input.context.trim().slice(0, 4000)}`)
  const inputBlock = parts.join('\n\n')
  return {
    id: DESIGN_EXPERIMENTS_PROMPT.id,
    version: DESIGN_EXPERIMENTS_PROMPT.version,
    instruction,
    inputBlock,
    relayText: composeRelayText(
      instruction,
      inputBlock,
      '{"experiments":[{"hypothesis":"若提供一键导入模板，则 60% 以上用户能在 5 分钟内完成首次导入","method":"假门测试：引导页放置「一键导入」入口，运行 7 天记录展示与点击","successCriteria":"入口点击率 ≥ 25%"}]}',
    ),
  }
}

export interface ReportPromptInput {
  projectName?: string
  /** buildReportContext 的聚合产物（builder 只负责截断，不负责聚合）。 */
  context: string
}

export function buildReportPrompt(input: ReportPromptInput): PromptBundle {
  const instruction = getPrompt(GENERATE_REPORT_PROMPT.id, GENERATE_REPORT_PROMPT.version).template
  const parts: string[] = []
  if (input.projectName) parts.push(`项目名称：${input.projectName}`)
  parts.push(`## 项目发现数据\n${input.context.trim().slice(0, 8000)}`)
  const inputBlock = parts.join('\n\n')
  return {
    id: GENERATE_REPORT_PROMPT.id,
    version: GENERATE_REPORT_PROMPT.version,
    instruction,
    inputBlock,
    relayText: composeRelayText(
      instruction,
      inputBlock,
      '{"title":"宠物鲜食外卖 · 发现报告","sections":["背景","假设优先级","结论与下一步"],"content":"## 背景\\n面向城市养宠家庭的鲜食外卖订阅……\\n## 假设优先级\\n- 付费意愿（价值，优先分 20.0）……\\n## 结论与下一步\\n价值假设仍是最大缺口……"}',
    ),
  }
}
