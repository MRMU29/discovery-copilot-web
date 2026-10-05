import { describe, expect, it } from 'vitest'
import { buildExperimentPrompt, buildIdentifyPrompt } from '@/ai/prompts/builders'

const CONTEXT = '面向自由职业者的 AI 记账助手：自动导入发票、分类支出、生成报税草稿。目标用户每月开票 20–100 张。'

describe('buildIdentifyPrompt', () => {
  const bundle = buildIdentifyPrompt({ projectName: 'AI 记账', context: CONTEXT })

  it('produces a versioned bundle with all three shared fields', () => {
    expect(bundle.id).toBe('identify-assumptions')
    expect(bundle.version).toBe('1.0.0')
    expect(bundle.instruction.trim()).not.toBe('')
    expect(bundle.inputBlock.trim()).not.toBe('')
    expect(bundle.relayText.trim()).not.toBe('')
  })

  it('shares the same instruction between BYOK system and relay text', () => {
    expect(bundle.relayText).toContain(bundle.instruction)
    expect(bundle.relayText).toContain(bundle.inputBlock)
  })

  it('instruction carries the output schema and the JSON-only rule', () => {
    expect(bundle.instruction).toContain('八个风险类别')
    expect(bundle.instruction).toContain('{"assumptions":[')
    expect(bundle.instruction).toContain('只输出一个 JSON 对象')
  })

  it('input block carries project name and context', () => {
    expect(bundle.inputBlock).toContain('项目名称：AI 记账')
    expect(bundle.inputBlock).toContain(CONTEXT)
  })

  it('relay text ends with the output rule and a few-shot example', () => {
    expect(bundle.relayText).toContain('## 待处理输入')
    expect(bundle.relayText).toContain('## 输出示例')
    expect(bundle.relayText).toContain('suggestedImpact')
  })
})

describe('buildExperimentPrompt', () => {
  const bundle = buildExperimentPrompt({
    projectName: 'AI 记账',
    assumption: {
      statement: '自由职业者愿意为自动报税整理支付每月 10 元',
      type: 'value',
      impact: 4,
      risk: 4,
      confidence: null,
    },
    context: '只有网页端，希望一周内得到结论',
  })

  it('registers under design-experiments with all three fields', () => {
    expect(bundle.id).toBe('design-experiments')
    expect(bundle.version).toBe('1.0.0')
    expect(bundle.instruction).toContain('{"experiments":[')
    expect(bundle.relayText).toContain(bundle.inputBlock)
  })

  it('renders the assumption block with the Chinese category label', () => {
    expect(bundle.inputBlock).toContain('风险类别：value（价值）')
    expect(bundle.inputBlock).toContain('自由职业者愿意为自动报税整理支付每月 10 元')
  })

  it('renders confidence as 未评估 when null and as a percent otherwise', () => {
    expect(bundle.inputBlock).toContain('信心 未评估')
    const evaluated = buildExperimentPrompt({
      assumption: {
        statement: '另一个假设',
        type: 'usability',
        impact: 3,
        risk: 3,
        confidence: 0.4,
      },
      context: CONTEXT,
    })
    expect(evaluated.inputBlock).toContain('信心 40%')
  })

  it('includes a fake-door few-shot example in the relay text', () => {
    expect(bundle.relayText).toContain('假门测试')
    expect(bundle.relayText).toContain('successCriteria')
  })
})
