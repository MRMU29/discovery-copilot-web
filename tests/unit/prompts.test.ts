import { describe, expect, it } from 'vitest'
import { CHAT_PROMPT, getPrompt, latestPromptVersion, registerPrompt } from '@/ai/prompts'

describe('prompt version registry (§6.4)', () => {
  it('ships the v1 baseline prompts', () => {
    expect(CHAT_PROMPT.version).toBe('1.1.0')
    expect(getPrompt('chat', '1.0.0').template).toContain('产品发现助手')
    expect(getPrompt('chat-json', '1.0.0').template).toContain('JSON')
  })

  it('rejects duplicate (id, version) registration', () => {
    expect(() => registerPrompt('chat', '1.0.0', 'duplicate')).toThrow(/already registered/)
  })

  it('resolves the latest version for an id', () => {
    // 用独立 id 探测排序逻辑：chat 的真实 1.1.0 已由内置注册占用。
    registerPrompt('version-probe', '1.0.0', 'v1 template')
    registerPrompt('version-probe', '1.1.0', 'v1.1 template')
    expect(latestPromptVersion('version-probe')).toBe('1.1.0')
    expect(getPrompt('version-probe', '1.0.0').template).toBe('v1 template') // 旧版本仍可取
  })

  it('throws for unregistered prompts', () => {
    expect(() => getPrompt('nope', '1.0.0')).toThrow(/not registered/)
    expect(() => latestPromptVersion('nope')).toThrow(/no registered versions/)
  })
})
