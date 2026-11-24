import { afterEach, describe, expect, it } from 'vitest'
import { getPrompt, latestPromptVersion } from '@/ai/prompts'
import {
  buildExperimentPrompt,
  buildIdentifyPrompt,
  buildReportPrompt,
} from '@/ai/prompts/builders'
import { setLocale } from '@/lib/i18n'

/**
 * P1.1.0 语言注入：模板里只剩 {{language}}，由 builder 在组装时按当前 UI 语言填。
 * 这里同时守两件事：本地化真的生效；旧的 1.0.0 模板仍可取（账本可复现）。
 */

const assumption = {
  statement: '用户愿意为自动对账付费',
  type: 'value',
  impact: 4,
  risk: 4,
  confidence: null,
}

describe('prompt 语言注入（1.1.0）', () => {
  // 每个用例结束复位：i18n 是模块级单例，泄漏会让其他文件的断言飘。
  afterEach(() => setLocale('zh-Hans'))

  it('en：instruction 与 relayText 都不再出现写死的中文语言名', () => {
    setLocale('en')
    const bundle = buildIdentifyPrompt({ context: '面向自由职业者的报税整理工具，月付 10 元' })
    expect(bundle.instruction).toContain('English')
    expect(bundle.instruction).not.toContain('简体中文')
    expect(bundle.relayText).not.toContain('简体中文')
  })

  it('ja / fr：按 UI 语言注入对应语言名', () => {
    setLocale('ja')
    expect(buildExperimentPrompt({ assumption }).instruction).toContain('Japanese')
    expect(buildExperimentPrompt({ assumption }).instruction).not.toContain('简体中文')

    setLocale('fr')
    expect(buildReportPrompt({ context: '项目背景与若干假设、实验数据' }).instruction).toContain('French')
    expect(buildReportPrompt({ context: '项目背景与若干假设、实验数据' }).instruction).not.toContain('简体中文')
  })

  it('zh-Hans：模板里的占位符被替换为带母语括注的英文语言名', () => {
    setLocale('zh-Hans')
    const { instruction } = buildIdentifyPrompt({ context: '面向自由职业者的报税整理工具，月付 10 元' })
    expect(instruction).toMatch(/Simplified Chinese/)
    expect(instruction).not.toContain('{{language}}')
  })

  it('注册表：1.0.0 仍可取，latest 已是 1.1.0', () => {
    expect(getPrompt('identify-assumptions', '1.0.0').template).toContain('简体中文')
    expect(latestPromptVersion('identify-assumptions')).toBe('1.1.0')
    expect(latestPromptVersion('design-experiments')).toBe('1.1.0')
    expect(latestPromptVersion('generate-report')).toBe('1.1.0')
  })

  it('三个 builder 都写 1.1.0，账本不会记成旧版', () => {
    expect(buildIdentifyPrompt({ context: 'x'.repeat(20) }).version).toBe('1.1.0')
    expect(buildExperimentPrompt({ assumption }).version).toBe('1.1.0')
    expect(buildReportPrompt({ context: 'x'.repeat(20) }).version).toBe('1.1.0')
  })
})
