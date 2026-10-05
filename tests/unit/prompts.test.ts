import { describe, expect, it } from 'vitest'
import { CHAT_PROMPT, getPrompt, latestPromptVersion, registerPrompt } from '@/ai/prompts'

describe('prompt version registry (§6.4)', () => {
  it('ships the v1 baseline prompts', () => {
    expect(CHAT_PROMPT.version).toBe('1.0.0')
    expect(getPrompt('chat', '1.0.0').template).toContain('产品发现助手')
    expect(getPrompt('chat-json', '1.0.0').template).toContain('JSON')
  })

  it('rejects duplicate (id, version) registration', () => {
    expect(() => registerPrompt('chat', '1.0.0', 'duplicate')).toThrow(/already registered/)
  })

  it('resolves the latest version for an id', () => {
    registerPrompt('chat', '1.1.0', 'v1.1 template')
    expect(latestPromptVersion('chat')).toBe('1.1.0')
    expect(getPrompt('chat', '1.0.0').template).toContain('产品发现助手') // 旧版本仍可取
  })

  it('throws for unregistered prompts', () => {
    expect(() => getPrompt('nope', '1.0.0')).toThrow(/not registered/)
    expect(() => latestPromptVersion('nope')).toThrow(/no registered versions/)
  })
})
