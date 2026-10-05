/**
 * 本地输入质量检测（混合模式「始终可用」部分）：对即将交给 AI / Relay 的
 * 项目背景做即时启发式提示。纯本地规则、不联网、不阻断提交——只帮用户在
 * 生成 Prompt 前补强上下文，减少「AI 只能给泛泛假设」的情况。
 */

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
    issues.push(`描述过短（当前 ${trimmed.length} 字，建议 40 字以上），AI 可能只能给出泛泛的假设。`)
  }
  if (!/\d/.test(trimmed)) {
    issues.push('未包含数字或量化信息（如用户量、频率、金额、时间），建议补充可衡量的场景。')
  }
  if (!AUDIENCE_HINT.test(trimmed)) {
    issues.push('未提及目标人群（如「自由职业者」「中小企业主」），建议明确服务对象。')
  }
  const hedges = HEDGES.filter((w) => trimmed.includes(w))
  if (hedges.length > 0) {
    issues.push(`包含模糊表述（${hedges.join('、')}），建议改为具体、可证伪的陈述。`)
  }

  return { level: issues.length > 0 ? 'warn' : 'ok', issues }
}
