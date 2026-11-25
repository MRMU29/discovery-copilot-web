import { afterEach, describe, expect, it } from 'vitest'
import { getPrompt, latestPromptVersion } from '@/ai/prompts'
import {
  buildExperimentPrompt,
  buildIdentifyPrompt,
  buildReportPrompt,
} from '@/ai/prompts/builders'
import {
  DEFAULT_PROMPT_OPTIONS,
  detailFragment,
  toneFragment,
} from '@/ai/prompts/options'
import { setLocale } from '@/lib/i18n'

const assumption = {
  statement: '用户愿意为自动对账付费',
  type: 'value',
  impact: 4,
  risk: 4,
  confidence: null,
}

describe('prompt options (1.2.0)', () => {
  afterEach(() => setLocale('zh-Hans'))

  it('defaults to neutral tone and standard detail', () => {
    expect(DEFAULT_PROMPT_OPTIONS).toEqual({ tone: 'neutral', detail: 'standard' })
    const { instruction } = buildIdentifyPrompt({ context: 'x'.repeat(20) })
    expect(instruction).toContain(toneFragment('neutral'))
    expect(instruction).toContain(detailFragment('standard'))
  })

  it('injects the chosen tone and detail into instruction and relay text', () => {
    const options = { tone: 'direct', detail: 'deep' } as const
    const bundle = buildIdentifyPrompt({ context: 'x'.repeat(20) }, options)
    expect(bundle.instruction).toContain(toneFragment('direct'))
    expect(bundle.instruction).toContain(detailFragment('deep'))
    expect(bundle.relayText).toContain(toneFragment('direct'))
    // No unresolved placeholders may leak into a real prompt.
    expect(bundle.instruction).not.toContain('{{tone}}')
    expect(bundle.instruction).not.toContain('{{detail}}')
  })

  it('records the effective options for the usage ledger', () => {
    setLocale('en')
    const bundle = buildReportPrompt({ context: 'x'.repeat(40) }, { tone: 'warm', detail: 'brief' })
    expect(bundle.options).toEqual({ tone: 'warm', detail: 'brief', language: 'en' })
  })

  it('keeps 1.0.0 and 1.1.0 retrievable and exposes 1.2.0 as latest', () => {
    expect(getPrompt('generate-report', '1.0.0').template).toContain('简体中文')
    expect(getPrompt('generate-report', '1.1.0').template).toContain('{{language}}')
    expect(getPrompt('generate-report', '1.2.0').template).toContain('{{tone}}')
    for (const id of ['identify-assumptions', 'design-experiments', 'generate-report']) {
      expect(latestPromptVersion(id)).toBe('1.2.0')
    }
  })

  it('applies to all three task builders with the same version', () => {
    const options = { tone: 'warm', detail: 'brief' } as const
    expect(buildIdentifyPrompt({ context: 'x'.repeat(20) }, options).version).toBe('1.2.0')
    expect(buildExperimentPrompt({ assumption }, options).version).toBe('1.2.0')
    expect(buildReportPrompt({ context: 'x'.repeat(40) }, options).version).toBe('1.2.0')
  })
})
