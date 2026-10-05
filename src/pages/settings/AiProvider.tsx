import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AIError, createProvider as createAiProvider, clearSessionKeys, getSessionKey, setSessionKey, summarizeUsage } from '@/ai'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/common/states'
import { db } from '@/db/db'
import { resolveAiRoute, AI_MODE_META, AI_MODES, type AiMode } from '@/lib/ai-mode'
import type { AiRequest, ProviderConfigRow } from '@/schemas/entities'
import { listActiveProjects } from '@/services/projects'
import { createProvider, deleteProvider, listProviders, setDefaultProvider } from '@/services/ai-providers'
import { getSettings, updateSettings } from '@/services/settings'

type ProviderKind = ProviderConfigRow['kind']

const KIND_LABELS: Record<ProviderKind, string> = {
  'openai-compatible': 'OpenAI 兼容（DeepSeek / Kimi / GLM…）',
  gemini: 'Gemini',
}

const cardClass = 'rounded-lg border border-hairline bg-surface-1 p-4'

/** 常见 OpenAI 兼容服务的公开端点预填（用户只需填 Key）——纯静态数据，不联网探测。 */
const PROVIDER_PRESETS = [
  { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { label: 'Kimi（月之暗面）', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { label: 'GLM（智谱）', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { label: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3' },
] as const

const inputClass =
  'mt-1 w-full rounded-btn border border-hairline-strong bg-surface-1 px-3 py-2 text-body text-ink placeholder:text-ink-faint focus:border-accent-focus focus:outline-none'

const PROMPT_LABELS: Record<string, string> = {
  'identify-assumptions': '假设识别',
  'design-experiments': '实验设计',
  chat: '对话',
  'chat-json': 'JSON 对话',
}

function fmtUsd(usd: number): string {
  return `$${usd.toFixed(4)}`
}

/** §6.4 用量视图：月合计 + 按日汇总 + 最近 20 条明细。 */
function UsageView({ rows, projects }: { rows: AiRequest[]; projects: { id: string; name: string }[] }) {
  const summary = summarizeUsage(rows)
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]))
  const details = rows.slice(0, 20)
  return (
    <div className="space-y-4">
      <p className="text-body-sm text-ink">
        共 {summary.totalCount} 次请求 · 输入 {summary.totalInputTokens.toLocaleString()} / 输出{' '}
        {summary.totalOutputTokens.toLocaleString()} tokens · 预估 {fmtUsd(summary.totalUsd)}
        <span className="ml-1 text-caption text-ink-faint">（内置参考价，实际以 Provider 账单为准）</span>
      </p>

      <div className="overflow-x-auto rounded-lg border border-hairline">
        <table className="w-full min-w-[480px] text-left text-caption">
          <thead className="border-b border-hairline bg-surface-2 text-ink-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">日期</th>
              <th scope="col" className="px-3 py-2 font-medium">请求</th>
              <th scope="col" className="px-3 py-2 font-medium">Tokens（入/出）</th>
              <th scope="col" className="px-3 py-2 font-medium">预估费用</th>
            </tr>
          </thead>
          <tbody>
            {summary.days.map((day) => (
              <tr key={day.date} className="border-b border-hairline last:border-0 text-ink-secondary">
                <td className="px-3 py-1.5 text-ink">{day.date}</td>
                <td className="px-3 py-1.5">{day.count}</td>
                <td className="px-3 py-1.5">
                  {day.inputTokens.toLocaleString()} / {day.outputTokens.toLocaleString()}
                </td>
                <td className="px-3 py-1.5">{fmtUsd(day.estimatedUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="rounded-lg border border-hairline bg-surface-2 p-3">
        <summary className="cursor-pointer text-caption text-ink-secondary">最近 {details.length} 条请求明细</summary>
        <ul className="mt-2 space-y-1.5">
          {details.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-caption text-ink-secondary">
              <span className="text-ink-faint">{row.createdAt.slice(5, 16).replace('T', ' ')}</span>
              <span className="text-ink">{projectNameById.get(row.projectId ?? '') ?? '—'}</span>
              <span>{row.model}</span>
              <span>{PROMPT_LABELS[row.promptId] ?? row.promptId}</span>
              <span className={row.status === 'ok' ? 'text-success' : 'text-danger'}>
                {row.status === 'ok' ? '成功' : (row.errorCode ?? '失败')}
              </span>
              <span className="text-ink-faint">
                {row.inputTokens}/{row.outputTokens} tok · {row.estimatedUsd != null ? fmtUsd(row.estimatedUsd) : '—'}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}

/** 设置页「AI Provider」：AI 模式切换（即改即存）+ Provider 最小管理。 */
export default function AiProvider() {
  const settings = useLiveQuery(() => getSettings(), [])
  const providers = useLiveQuery(() => listProviders(), [])
  const [showAdd, setShowAdd] = useState(false)
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState<ProviderKind>('openai-compatible')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [addKey, setAddKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  /** 会话内 Key 管理：providerId → 输入值 / 保存态 / 测试态。 */
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({})
  const [keySaved, setKeySaved] = useState<Record<string, boolean>>({})
  const [keyTesting, setKeyTesting] = useState<Record<string, 'ok' | 'fail' | 'busy' | undefined>>({})
  /** 预算输入草稿：用户输入过的字段以草稿为准；'' = 不限（null），onBlur 提交。 */
  const [budgetDrafts, setBudgetDrafts] = useState<Record<string, string>>({})
  const perRequestValue = budgetDrafts.perRequest ?? (settings?.perRequestBudgetUsd != null ? String(settings.perRequestBudgetUsd) : '')
  const monthlyValue = budgetDrafts.monthly ?? (settings?.monthlyBudgetUsd != null ? String(settings.monthlyBudgetUsd) : '')

  const usageRows = useLiveQuery(() => db.ai_requests.orderBy('id').reverse().limit(500).toArray(), [])
  const projects = useLiveQuery(() => listActiveProjects(), [])

  async function handleMode(mode: AiMode) {
    setError(null)
    try {
      await updateSettings({ aiMode: mode })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleBudget(field: 'perRequestBudgetUsd' | 'monthlyBudgetUsd', raw: string) {
    const trimmed = raw.trim()
    if (trimmed === '') {
      await updateSettings({ [field]: null })
      return
    }
    const value = Number(trimmed)
    if (!Number.isFinite(value) || value <= 0) {
      setError('预算上限必须是正数（USD），留空表示不设限。')
      return
    }
    setError(null)
    await updateSettings({ [field]: value })
    setBudgetDrafts((prev) => {
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  function handleClearSessionKeys() {
    if (!window.confirm('清除本会话保存的全部 API Key？Provider 配置保留，之后调用 AI 需重新输入 Key。')) return
    clearSessionKeys()
    setKeyDrafts({})
    setKeySaved({})
    setKeyTesting({})
    setError(null)
  }

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      const row = await createProvider({ label: label.trim(), kind, baseUrl: baseUrl.trim(), model: model.trim() })
      if (!providers || providers.length === 0) await setDefaultProvider(row.id)
      // 添加时顺手把 Key 存入会话内存——保存完即可直接测试连接（留空则稍后在卡片里填）。
      const key = addKey.trim()
      if (key) setSessionKey(row.id, key)
      setShowAdd(false)
      setLabel('')
      setBaseUrl('')
      setModel('')
      setAddKey('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('删除该 Provider 配置？API Key 从未落库，无需额外清理。')) return
    setError(null)
    try {
      await deleteProvider(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function handleSaveKey(id: string) {
    const value = (keyDrafts[id] ?? '').trim()
    if (!value) {
      setError('请先输入 API Key。')
      return
    }
    setError(null)
    setSessionKey(id, value)
    setKeySaved((prev) => ({ ...prev, [id]: true }))
  }

  async function handleTestKey(row: ProviderConfigRow) {
    const key = (keyDrafts[row.id] ?? '').trim() || getSessionKey(row.id)
    if (!key) {
      setError('请先输入或保存该 Provider 的 API Key，再测试连接。')
      return
    }
    setError(null)
    setKeyTesting((prev) => ({ ...prev, [row.id]: 'busy' }))
    try {
      const adapter = createAiProvider(row, { getApiKey: () => key })
      await adapter.testConnection()
      setKeyTesting((prev) => ({ ...prev, [row.id]: 'ok' }))
    } catch (err) {
      setKeyTesting((prev) => ({ ...prev, [row.id]: 'fail' }))
      setError(err instanceof AIError ? err.message : err instanceof Error ? err.message : String(err))
    }
  }

  if (settings === undefined || providers === undefined) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 animate-pulse rounded-md bg-surface-3" />
        <div className="h-32 animate-pulse rounded-lg bg-surface-3" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-headline text-ink">AI Provider</h1>
        <p className="mt-1 text-body-sm text-ink-muted">
          应用自身不持有密钥：BYOK 直连你配置的服务，或用 Prompt Relay 借外部 AI 助手完成任务。
        </p>
      </header>

      <section aria-label="AI 模式" className="space-y-3">
        <h2 className="text-eyebrow text-ink-muted">AI 模式</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {AI_MODES.map((mode) => (
            <label
              key={mode}
              className={`flex min-h-11 cursor-pointer flex-col gap-1 rounded-lg border p-4 transition-colors ${
                settings.aiMode === mode ? 'border-accent ring-1 ring-accent' : 'border-hairline bg-surface-1 hover:bg-surface-2'
              }`}
            >
              <span className="flex items-center gap-2 text-body text-ink">
                <input
                  type="radio"
                  name="ai-mode"
                  value={mode}
                  checked={settings.aiMode === mode}
                  onChange={() => void handleMode(mode)}
                  className="size-4 accent-accent"
                />
                {AI_MODE_META[mode].label}
              </span>
              <span className="text-caption text-ink-muted">{AI_MODE_META[mode].description}</span>
            </label>
          ))}
        </div>
        <p role="status" className="rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-caption text-ink-secondary">
          当前生效路径：
          {resolveAiRoute(settings.aiMode, providers.length > 0) === 'byok'
            ? `内置 AI（BYOK）${providers.length > 0 ? `——使用 ${providers.find((p) => p.id === settings.defaultProviderId)?.label ?? providers[0].label}` : '（尚未配置 Provider，AI 对话框会先引导你添加）'}`
            : 'Prompt Relay——生成 Prompt 交给你的外部 AI 助手，零配置'}
        </p>
      </section>

      <section aria-label="预算熔断" className="space-y-3">
        <h2 className="text-eyebrow text-ink-muted">预算熔断（USD · 留空 = 不限）</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-caption text-ink-muted">
            单次请求上限
            <input
              type="number"
              min="0"
              step="0.01"
              value={perRequestValue}
              onChange={(e) => setBudgetDrafts((prev) => ({ ...prev, perRequest: e.target.value }))}
              onBlur={(e) => void handleBudget('perRequestBudgetUsd', e.target.value)}
              placeholder="例：0.50"
              className="mt-1 w-full rounded-btn border border-hairline-strong bg-surface-1 px-3 py-2 text-body text-ink placeholder:text-ink-faint focus:border-accent-focus focus:outline-none"
            />
          </label>
          <label className="text-caption text-ink-muted">
            月度上限
            <input
              type="number"
              min="0"
              step="0.5"
              value={monthlyValue}
              onChange={(e) => setBudgetDrafts((prev) => ({ ...prev, monthly: e.target.value }))}
              onBlur={(e) => void handleBudget('monthlyBudgetUsd', e.target.value)}
              placeholder="例：10"
              className="mt-1 w-full rounded-btn border border-hairline-strong bg-surface-1 px-3 py-2 text-body text-ink placeholder:text-ink-faint focus:border-accent-focus focus:outline-none"
            />
          </label>
        </div>
        <p className="text-caption text-ink-faint">
          发起请求前按内置参考价预估费用，超过上限时进入确认流程而非静默失败；确认单次绕过后才继续。
        </p>
      </section>

      <section aria-label="Provider 列表" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-eyebrow text-ink-muted">Provider（BYOK / 混合模式使用）</h2>
          <Button variant="secondary" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? '取消添加' : '添加 Provider'}
          </Button>
        </div>

        <p className="text-caption text-ink-faint">
          API Key 仅保存在当前会话内存，不写入本地数据库，也不随 .dcopilot 文件导出。
          <button
            type="button"
            onClick={handleClearSessionKeys}
            className="ml-2 text-caption text-danger underline-offset-2 hover:underline"
          >
            清除全部会话 Key
          </button>
        </p>

        {showAdd && (
          <form onSubmit={handleAdd} className="space-y-3 rounded-lg border border-hairline bg-surface-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-caption text-ink-muted">快速预填：</span>
              {PROVIDER_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setKind('openai-compatible')
                    setLabel(preset.label)
                    setBaseUrl(preset.baseUrl)
                    setModel(preset.model)
                  }}
                  className="min-h-9 rounded-btn border border-hairline-strong bg-surface-1 px-3 text-caption text-ink hover:border-accent-focus hover:text-accent-hover"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="provider-label" className="text-caption text-ink-muted">
                  名称
                </label>
                <input
                  id="provider-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="例：DeepSeek"
                  maxLength={60}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="provider-kind" className="text-caption text-ink-muted">
                  类型
                </label>
                <select
                  id="provider-kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as ProviderKind)}
                  className={`${inputClass} min-h-11`}
                >
                  {(Object.keys(KIND_LABELS) as ProviderKind[]).map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="provider-base-url" className="text-caption text-ink-muted">
                Base URL
              </label>
              <input
                id="provider-base-url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.deepseek.com/v1"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="provider-model" className="text-caption text-ink-muted">
                模型
              </label>
              <input
                id="provider-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="deepseek-chat"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="provider-add-key" className="text-caption text-ink-muted">
                API Key（可选，仅保存在当前会话内存，关闭页面即消失）
              </label>
              <input
                id="provider-add-key"
                type="password"
                value={addKey}
                onChange={(e) => setAddKey(e.target.value)}
                placeholder="sk-…"
                autoComplete="off"
                className={inputClass}
              />
            </div>
            <Button type="submit" disabled={!label.trim() || !baseUrl.trim() || !model.trim()}>
              保存
            </Button>
          </form>
        )}

        {providers.length === 0 ? (
          <EmptyState
            title="还没有 Provider"
            description="Relay 模式无需任何配置即可使用全部 AI 功能；只有 BYOK / 混合模式需要在这里添加 Provider。"
          />
        ) : (
          <ul className="space-y-3">
            {providers.map((p) => (
              <li key={p.id} className={cardClass}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-card-title text-ink">{p.label}</p>
                  {settings.defaultProviderId === p.id && (
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-caption text-ink">默认</span>
                  )}
                  <span className="ml-auto flex gap-2">
                    {settings.defaultProviderId !== p.id && (
                      <Button variant="ghost" onClick={() => void setDefaultProvider(p.id)}>
                        设为默认
                      </Button>
                    )}
                    <Button variant="danger" onClick={() => void handleDelete(p.id)}>
                      删除
                    </Button>
                  </span>
                </div>
                <p className="mt-1 text-caption text-ink-muted">
                  {KIND_LABELS[p.kind]} · {p.baseUrl} · {p.model}
                </p>
                <div className="mt-3 space-y-2 border-t border-hairline pt-3">
                  <label htmlFor={`provider-key-${p.id}`} className="text-caption text-ink-muted">
                    API Key（仅保存在当前会话内存，关闭页面即消失）
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <input
                      id={`provider-key-${p.id}`}
                      type="password"
                      value={keyDrafts[p.id] ?? ''}
                      onChange={(e) => {
                        setKeyDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))
                        setKeySaved((prev) => ({ ...prev, [p.id]: false }))
                        setKeyTesting((prev) => ({ ...prev, [p.id]: undefined }))
                      }}
                      placeholder={keySaved[p.id] ? '已保存（本会话）——输入可替换' : 'sk-…'}
                      autoComplete="off"
                      className="min-h-11 flex-1 rounded-btn border border-hairline-strong bg-surface-1 px-3 text-body text-ink placeholder:text-ink-faint focus:border-accent-focus focus:outline-none"
                    />
                    <Button variant="secondary" onClick={() => handleSaveKey(p.id)}>
                      保存到本会话
                    </Button>
                    <Button variant="ghost" onClick={() => void handleTestKey(p)} disabled={keyTesting[p.id] === 'busy'}>
                      {keyTesting[p.id] === 'busy' ? '测试中…' : '测试连接'}
                    </Button>
                  </div>
                  {keyTesting[p.id] === 'ok' && <p className="text-caption text-success">连接成功。</p>}
                  {keyTesting[p.id] === 'fail' && <p className="text-caption text-danger">连接失败，见下方错误。</p>}
                  {keySaved[p.id] && keyTesting[p.id] === undefined && (
                    <p className="text-caption text-ink-faint">已保存到本会话——AI 对话框将直接使用，无需重复输入。</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="用量" className="space-y-3">
        <h2 className="text-eyebrow text-ink-muted">用量（仅存本地，不随 .dcopilot 导出）</h2>
        {!usageRows || usageRows.length === 0 ? (
          <p className="text-caption text-ink-faint">
            暂无 AI 请求记录——使用内置 AI（BYOK）识别假设或设计实验后，这里会展示按日用量与请求明细。
          </p>
        ) : (
          <UsageView rows={usageRows} projects={projects ?? []} />
        )}
      </section>

      {error && (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
