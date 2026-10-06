/**
 * 本地输入质量检测（混合模式「始终可用」部分）：对即将交给 AI / Relay 的
 * 项目背景做即时启发式提示。纯本地规则、不联网、不阻断提交——只帮用户在
 * 生成 Prompt 前补强上下文，减少「AI 只能给泛泛假设」的情况。
 */

import { translate } from '@/lib/i18n'

export interface InputQuality {
  level: 'ok' | 'warn'
  issues: string[]
}

const HEDGES = ['可能', '大概', '也许', '应该', '差不多']
const AUDIENCE_HINT =
  /(用户|客户|人群|企业|团队|自由职业者|学生|店主|卖家|买家|运营|经理|工程师|医生|老师|会计|设计师)/

export function analyzeInputQuality(text: string): InputQuality {
  const trimmed = text.trim()
  const issues: string[] = []

  if (trimmed.length < 40) {
    issues.push(translate('ai.quality.tooShort', { length: trimmed.length }))
  }
  if (!/\d/.test(trimmed)) {
    issues.push(translate('ai.quality.noNumbers'))
  }
  if (!AUDIENCE_HINT.test(trimmed)) {
    issues.push(translate('ai.quality.noAudience'))
  }
  const hedges = HEDGES.filter((w) => trimmed.includes(w))
  if (hedges.length > 0) {
    issues.push(translate('ai.quality.hedges', { words: hedges.join('、') }))
  }

  return { level: issues.length > 0 ? 'warn' : 'ok', issues }
}
