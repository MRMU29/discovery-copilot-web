import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  AIError,
  createProvider as createAiProvider,
  estimateCostUsd,
  estimateMessagesTokens,
  getSessionKey,
  setSessionKey,
} from '@/ai'
import { resolvePricing } from '@/ai/pricing'
import { buildIdentifyPrompt } from '@/ai/prompts/builders'
import { AIReviewActions } from '@/components/ai/AIReviewActions'
import { RelayPanel } from '@/components/relay/RelayPanel'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { FieldHint } from '@/components/onboarding/FieldHint'
import { resolveAiRoute } from '@/lib/ai-mode'
import { analyzeInputQuality } from '@/lib/input-quality'
import { ASSUMPTION_TYPE_META, type AssumptionType } from '@/lib/assumption-meta'
import type { ProviderConfigRow } from '@/schemas/entities'
import { ASSUMPTION_TYPES } from '@/schemas/entities'
import {
  createProvider,
  listProviders,
  resolveDefaultProvider,
  setDefaultProvider,
} from '@/services/ai-providers'
import {
  applyIdentifiedAssumptions,
  identifyAssumptions,
  identifyResultSchema,
  type IdentifiedAssumption,
} from '@/services/assumption-ai'
import { getOnboarding, markOnboardingDone } from '@/services/onboarding'
import { getSettings } from '@/services/settings'

type Stage = 'config' | 'running' | 'relay' | 'preview'
type ProviderKind = 'openai-compatible' | 'gemini'

const KIND_LABELS: Record<ProviderKind, string> = {
  'openai-compatible': 'OpenAI 兼容（DeepSeek / Kimi / GLM…）',
  gemini: 'Gemini',
}

interface AIIdentifyDialogProps {
  projectId: string
  projectName?: string
  /** Pre-fills the context textarea. */
  projectDescription?: string
  onClose: () => void
  onApplied: (created: number, skipped: number) => void
}

const inputClass =
  'mt-1 w-full rounded-btn border border-hairline-strong bg-surface-1 px-3 py-2 text-body text-ink placeholder:text-ink-faint focus:border-accent-focus focus:outline-none'

/**
 * Mounted only while open (parent renders {aiOpen && ...}) — every local state
 * starts fresh on mount, so no reset-on-open effect is needed.
 */
export function AIIdentifyDialog({
  projectId,
  projectName,
  projectDescription,
  onClose,
  onApplied,
}: AIIdentifyDialogProps) {
  const [stage, setStage] = useState<Stage>('config')
  const [providers, setProviders] = useState<ProviderConfigRow[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [testState, setTestState] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [aiMode, setAiMode] = useState<'byok' | 'relay' | 'hybrid'>('relay')
  const [context, setContext] = useState(projectDescription ?? '')
  const [busy, setBusy] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [budgetError, setBudgetError] = useState<string | null>(null)
  const [estimate, setEstimate] = useState<{ inputTokens: number; usd: number | null } | null>(null)
  const [picks, setPicks] = useState<IdentifiedAssumption[]>([])
  const [checked, setChecked] = useState<boolean[]>([])
  const abortRef = useRef<AbortController | null>(null)

  const [showNewProvider, setShowNewProvider] = useState(false)
  const [npLabel, setNpLabel] = useState('')
  const [npKind, setNpKind] = useState<ProviderKind>('openai-compatible')
  const [npBaseUrl, setNpBaseUrl] = useState('')
  const [npModel, setNpModel] = useState('')

  async function refreshProviders() {
    const [rows, fallback] = await Promise.all([listProviders(), resolveDefaultProvider()])
    setProviders(rows)
    setSelectedId(fallback?.id ?? rows[0]?.id ?? '')
  }

  useEffect(() => {
    let alive = true
    Promise.all([listProviders(), resolveDefaultProvider()])
      .then(([rows, fallback]) => {
        if (!alive) return
        setProviders(rows)
        setSelectedId(fallback?.id ?? rows[0]?.id ?? '')
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true
    getSettings()
      .then((settings) => {
        if (alive) setAiMode(settings.aiMode)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => () => abortRef.current?.abort(), [])

  const selected = providers.find((p) => p.id === selectedId) ?? null
  const route = resolveAiRoute(aiMode, providers.length > 0)
  const quality = analyzeInputQuality(context)
  const onboarding = useLiveQuery(() => getOnboarding(), [])
  const hintsHighlighted = onboarding !== undefined && !onboarding.fieldHints

  async function handleAddProvider(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      const row = await createProvider({
        label: npLabel.trim(),
        kind: npKind,
        baseUrl: npBaseUrl.trim(),
        model: npModel.trim(),
      })
      await setDefaultProvider(row.id)
      await refreshProviders()
      setShowNewProvider(false)
      setNpLabel('')
      setNpBaseUrl('')
      setNpModel('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function ensureKey(): string | null {
    const key = apiKey.trim() || (selected ? getSessionKey(selected.id) : '')
    if (!key) {
      setError('请先输入该 Provider 的 API Key（可在设置页保存到本会话，或仅在此处临时输入）。')
      return null
    }
    if (selected) setSessionKey(selected.id, key)
    return key
  }

  async function handleTest() {
    if (!selected || !ensureKey()) return
    setBusy(true)
    setError(null)
    setTestState('idle')
    try {
      const adapter = createAiProvider(selected, { getApiKey: () => getSessionKey(selected.id) })
      await adapter.testConnection()
      setTestState('ok')
    } catch (err) {
      setTestState('fail')
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleIdentify(budgetConfirmed = false) {
    if (!selected || !ensureKey()) return
    const controller = new AbortController()
    abortRef.current = controller
    setStage('running')
    setBusy(true)
    setError(null)
    setBudgetError(null)
    // §6.4 请求前预估（输入侧）：上下文 + 系统指令，按内置参考价折算。
    const pricing = resolvePricing(selected.model)
    const inputTokens = estimateMessagesTokens([
      { content: buildIdentifyPrompt({ projectName, context }).instruction },
      { content: context },
    ])
    setEstimate({
      inputTokens,
      usd: pricing ? estimateCostUsd(inputTokens, 2048, pricing) : null,
    })
    try {
      const result = await identifyAssumptions(
        createAiProvider(selected, { getApiKey: () => getSessionKey(selected.id) }),
        { projectId, projectName, context, signal: controller.signal, budgetConfirmed },
      )
      setPicks(result.data)
      setChecked(result.data.map(() => true))
      void markOnboardingDone('fieldHints').catch(() => undefined)
      setStage('preview')
    } catch (err) {
      if (err instanceof AIError && err.code === 'ABORTED') {
        setError('已取消。')
      } else if (err instanceof AIError && err.code === 'BUDGET') {
        setBudgetError(err.message)
      } else {
        setError(err instanceof Error ? err.message : String(err))
      }
      setStage('config')
    } finally {
      abortRef.current = null
      setBusy(false)
    }
  }

  function editPick(index: number, patch: Partial<IdentifiedAssumption>) {
    setPicks((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }

  async function handleApply() {
    const chosen = picks.filter((_, i) => checked[i])
    if (chosen.length === 0) {
      setError('请至少勾选一条要应用的假设。')
      return
    }
    setApplying(true)
    setError(null)
    try {
      const result = await applyIdentifiedAssumptions(projectId, chosen)
      onApplied(result.created, result.skipped)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setApplying(false)
    }
  }

  const contextReady = context.trim().length >= 10

  return (
    <Dialog
      open
      title="AI 识别关键假设"
      onClose={onClose}
      size={stage === 'relay' ? 'lg' : 'md'}
    >
      {stage === 'config' && (
        <div className="space-y-4">
          <p className="rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-caption text-ink-secondary">
            当前路径：{route === 'byok' ? '内置 AI（BYOK）——应用直接调用你配置的 Provider' : 'Prompt Relay——零配置，复制 Prompt 给外部 AI 助手'}
          </p>

          {route === 'byok' &&
            (providers.length > 0 && !showNewProvider ? (
            <div>
              <label htmlFor="ai-provider-select" className="text-caption text-ink-muted">
                AI Provider
              </label>
              <select
                id="ai-provider-select"
                value={selectedId}
                onChange={(e) => {
                  setSelectedId(e.target.value)
                  setTestState('idle')
                }}
                className={`${inputClass} min-h-11`}
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}（{p.model}）
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <form onSubmit={handleAddProvider} className="space-y-3 rounded-lg border border-hairline bg-surface-2 p-3">
              <p className="text-caption text-ink-muted">
                首次使用需添加一个 AI Provider。API Key 不会保存在这里——每次会话单独输入。
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="np-label" className="text-caption text-ink-muted">
                    名称
                  </label>
                  <input
                    id="np-label"
                    value={npLabel}
                    onChange={(e) => setNpLabel(e.target.value)}
                    placeholder="例：DeepSeek"
                    maxLength={60}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="np-kind" className="text-caption text-ink-muted">
                    类型
                  </label>
                  <select
                    id="np-kind"
                    value={npKind}
                    onChange={(e) => setNpKind(e.target.value as ProviderKind)}
                    className={`${inputClass} min-h-11`}
                  >
                    {(Object.keys(KIND_LABELS) as ProviderKind[]).map((kind) => (
                      <option key={kind} value={kind}>
                        {KIND_LABELS[kind]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="np-base-url" className="text-caption text-ink-muted">
                  Base URL
                </label>
                <input
                  id="np-base-url"
                  value={npBaseUrl}
                  onChange={(e) => setNpBaseUrl(e.target.value)}
                  placeholder="https://api.deepseek.com/v1"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="np-model" className="text-caption text-ink-muted">
                  模型
                </label>
                <input
                  id="np-model"
                  value={npModel}
                  onChange={(e) => setNpModel(e.target.value)}
                  placeholder="deepseek-chat"
                  className={inputClass}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={!npLabel.trim() || !npBaseUrl.trim() || !npModel.trim()}>
                  保存并使用
                </Button>
                {providers.length > 0 && (
                  <Button variant="ghost" onClick={() => setShowNewProvider(false)}>
                    取消
                  </Button>
                )}
              </div>
            </form>
            ))}

          {route === 'byok' && providers.length > 0 && !showNewProvider && (
            <>
              <div>
                <label htmlFor="ai-api-key" className="text-caption text-ink-muted">
                  API Key（仅本会话有效）
                </label>
                <input
                  id="ai-api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value)
                    setTestState('idle')
                  }}
                  placeholder="sk-…"
                  autoComplete="off"
                  className={inputClass}
                />
              </div>
              <div className="flex items-center gap-3">
                <Button variant="secondary" onClick={handleTest} disabled={busy}>
                  测试连接
                </Button>
                {testState === 'ok' && <span className="text-caption text-success">连接成功</span>}
                {testState === 'fail' && <span className="text-caption text-danger">连接失败，见下方错误</span>}
                <button
                  type="button"
                  onClick={() => setShowNewProvider(true)}
                  className="ml-auto text-caption text-accent-hover underline-offset-2 hover:underline"
                >
                  添加新 Provider
                </button>
              </div>
            </>
          )}

          <div>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="ai-context" className="text-caption text-ink-muted">
                项目背景与想法（AI 依据此识别假设）
              </label>
              <FieldHint
                field="项目背景"
                highlighted={hintsHighlighted}
                onRead={() => void markOnboardingDone('fieldHints').catch(() => undefined)}
                good="面向一二线城市、月宠物支出 500 元以上的养猫家庭（目标用户）；他们想喂鲜食但没时间做（问题）；希望每周 30 分钟内搞定一周喂食（期望结果）。"
                bad="做一个改变宠物行业的伟大产品。"
              />
            </div>
            <textarea
              id="ai-context"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={6}
              placeholder="产品要解决什么问题、给谁用、怎么用、有什么约束…（至少 10 字）"
              className={inputClass}
            />
          </div>

          {quality.level === 'warn' && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3">
              <p className="text-caption font-medium text-warning">输入质量提示（本地检测，不阻断，仅建议补强）：</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-caption text-ink-secondary">
                {quality.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          )}

          {budgetError && (
            <div role="alert" className="rounded-lg border border-warning/40 bg-warning/10 p-3">
              <p className="text-body-sm text-ink">{budgetError}</p>
              <Button className="mt-2" variant="secondary" onClick={() => void handleIdentify(true)}>
                本次继续（预算内确认）
              </Button>
            </div>
          )}

          {error && (
            <p role="alert" className="text-body-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            {route === 'byok' ? (
              <Button
                onClick={() => void handleIdentify(false)}
                disabled={busy || !contextReady || providers.length === 0 || showNewProvider}
              >
                开始识别
              </Button>
            ) : (
              <Button onClick={() => setStage('relay')} disabled={!contextReady}>
                生成 Prompt
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              关闭
            </Button>
          </div>
        </div>
      )}

      {stage === 'running' && (
        <div className="flex flex-col items-center gap-4 py-10" role="status">
          <div
            aria-hidden
            className="size-8 animate-spin rounded-full border-2 border-hairline-strong border-t-accent"
          />
          <p className="text-body-sm text-ink-secondary">正在从八个风险类别识别关键假设…</p>
          {estimate && (
            <p className="text-caption text-ink-faint">
              预估输入 ~{estimate.inputTokens} tokens ·{' '}
              {estimate.usd != null ? `约 $${estimate.usd.toFixed(4)}` : '计费未知（模型不在参考价表）'}
              <span className="ml-1">（内置参考价，实际以 Provider 账单为准）</span>
            </p>
          )}
          <Button variant="secondary" onClick={() => abortRef.current?.abort()}>
            取消
          </Button>
        </div>
      )}

      {stage === 'relay' && (
        <RelayPanel
          promptText={buildIdentifyPrompt({ projectName, context }).relayText}
          schema={identifyResultSchema}
          schemaDescription='{"assumptions":[{"statement":"一句话可证伪假设","type":"value|usability|feasibility|viability|go-to-market|strategy|team|legal","rationale":"判断错误为何损失重大","suggestedImpact":1-5,"suggestedRisk":1-5}]}，5–12 条'
          taskType="identify-assumptions"
          onApply={(data) => {
            setPicks(data.assumptions)
            setChecked(data.assumptions.map(() => true))
            setStage('preview')
          }}
        />
      )}

      {stage === 'preview' && (
        <div className="space-y-4">
          <p className="text-caption text-ink-muted">
            AI 建议先审核再入库：可修改陈述、类别与影响/风险分；信心一律留空，由你评估证据后填写。
          </p>
          <ul className="space-y-3">
            {picks.map((pick, i) => (
              <li key={i} className="rounded-lg border border-hairline bg-surface-2 p-3">
                <label className="flex min-h-9 items-center gap-2 text-body-sm text-ink">
                  <input
                    type="checkbox"
                    checked={checked[i] ?? false}
                    onChange={(e) =>
                      setChecked((prev) => prev.map((c, idx) => (idx === i ? e.target.checked : c)))
                    }
                    className="size-4 accent-accent"
                  />
                  应用这条建议
                </label>
                <textarea
                  value={pick.statement}
                  onChange={(e) => editPick(i, { statement: e.target.value })}
                  rows={2}
                  maxLength={500}
                  aria-label={`第 ${i + 1} 条假设陈述`}
                  className={`${inputClass} mt-2`}
                />
                {pick.rationale && (
                  <p className="mt-2 text-caption text-ink-faint">理由：{pick.rationale}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-caption">
                  <label className="flex items-center gap-1 text-ink-muted">
                    类别
                    <select
                      value={pick.type}
                      onChange={(e) => editPick(i, { type: e.target.value as AssumptionType })}
                      aria-label={`第 ${i + 1} 条风险类别`}
                      className="min-h-9 rounded-btn border border-hairline-strong bg-surface-1 px-2 text-caption text-ink"
                    >
                      {ASSUMPTION_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {ASSUMPTION_TYPE_META[t].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-1 text-ink-muted">
                    影响
                    <select
                      value={pick.suggestedImpact}
                      onChange={(e) => editPick(i, { suggestedImpact: Number(e.target.value) })}
                      aria-label={`第 ${i + 1} 条影响分`}
                      className="min-h-9 rounded-btn border border-hairline-strong bg-surface-1 px-2 text-caption text-ink"
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-1 text-ink-muted">
                    风险
                    <select
                      value={pick.suggestedRisk}
                      onChange={(e) => editPick(i, { suggestedRisk: Number(e.target.value) })}
                      aria-label={`第 ${i + 1} 条风险分`}
                      className="min-h-9 rounded-btn border border-hairline-strong bg-surface-1 px-2 text-caption text-ink"
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </li>
            ))}
          </ul>

          {error && (
            <p role="alert" className="text-body-sm text-danger">
              {error}
            </p>
          )}

          <AIReviewActions
            count={checked.filter(Boolean).length}
            total={picks.length}
            onToggleAll={(next) => setChecked(picks.map(() => next))}
            applying={applying}
            regenerating={busy}
            applyLabel="假设"
            onApply={() => void handleApply()}
            onReject={onClose}
            onRegenerate={() => void handleIdentify(false)}
            onBack={() => setStage('config')}
            backLabel="返回修改背景"
          />
        </div>
      )}
    </Dialog>
  )
}
