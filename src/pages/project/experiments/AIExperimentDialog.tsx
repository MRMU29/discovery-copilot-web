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
import { buildExperimentPrompt } from '@/ai/prompts/builders'
import { AIReviewActions } from '@/components/ai/AIReviewActions'
import { RelayPanel } from '@/components/relay/RelayPanel'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { FieldHint } from '@/components/onboarding/FieldHint'
import { resolveAiRoute } from '@/lib/ai-mode'
import { ASSUMPTION_TYPE_META } from '@/lib/assumption-meta'
import type { Assumption, ProviderConfigRow } from '@/schemas/entities'
import { listProviders, resolveDefaultProvider } from '@/services/ai-providers'
import {
  applySuggestedExperiments,
  experimentSuggestionSchema,
  suggestExperiments,
  type SuggestedExperiment,
} from '@/services/experiment-ai'
import { getOnboarding, markOnboardingDone } from '@/services/onboarding'
import { getSettings } from '@/services/settings'

type Stage = 'config' | 'running' | 'relay' | 'preview'

interface AIExperimentDialogProps {
  projectId: string
  projectName?: string
  assumptions: Assumption[]
  onClose: () => void
  onApplied: (created: number, skipped: number) => void
}

const inputClass =
  'mt-1 w-full rounded-btn border border-hairline-strong bg-surface-1 px-3 py-2 text-body text-ink placeholder:text-ink-faint focus:border-accent-focus focus:outline-none'

/**
 * Mounted only while open (parent renders {aiOpen && ...}) — state starts
 * fresh each time. Routes byok ↔ relay from settings + provider presence;
 * both paths share the same prompt bundle and the same review/apply chain.
 */
export function AIExperimentDialog({
  projectId,
  projectName,
  assumptions,
  onClose,
  onApplied,
}: AIExperimentDialogProps) {
  const [stage, setStage] = useState<Stage>('config')
  const [providers, setProviders] = useState<ProviderConfigRow[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [aiMode, setAiMode] = useState<'byok' | 'relay' | 'hybrid'>('relay')
  const [assumptionId, setAssumptionId] = useState(assumptions[0]?.id ?? '')
  const [context, setContext] = useState('')
  const [picks, setPicks] = useState<SuggestedExperiment[]>([])
  const [checked, setChecked] = useState<boolean[]>([])
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [budgetError, setBudgetError] = useState<string | null>(null)
  const [estimate, setEstimate] = useState<{ inputTokens: number; usd: number | null } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([listProviders(), resolveDefaultProvider(), getSettings()])
      .then(([rows, fallback, settings]) => {
        if (!alive) return
        setProviders(rows)
        setSelectedId(fallback?.id ?? rows[0]?.id ?? '')
        setAiMode(settings.aiMode)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => () => abortRef.current?.abort(), [])

  const route = resolveAiRoute(aiMode, providers.length > 0)
  const selected = providers.find((p) => p.id === selectedId) ?? null
  const assumption = assumptions.find((a) => a.id === assumptionId) ?? null
  const onboarding = useLiveQuery(() => getOnboarding(), [])
  const hintsHighlighted = onboarding !== undefined && !onboarding.fieldHints

  function ensureKey(): string | null {
    const key = apiKey.trim() || (selected ? getSessionKey(selected.id) : '')
    if (!key) {
      setError('请先输入该 Provider 的 API Key（可在设置页保存到本会话，或仅在此处临时输入）。')
      return null
    }
    if (selected) setSessionKey(selected.id, key)
    return key
  }

  async function handleSuggest(budgetConfirmed = false) {
    if (!assumption || !selected || !ensureKey()) return
    const controller = new AbortController()
    abortRef.current = controller
    setStage('running')
    setError(null)
    setBudgetError(null)
    // §6.4 请求前预估（输入侧）：假设块 + 背景，按内置参考价折算。
    const pricing = resolvePricing(selected.model)
    const inputTokens = estimateMessagesTokens([
      { content: `${assumption.statement}\n${context}` },
    ])
    setEstimate({
      inputTokens,
      usd: pricing ? estimateCostUsd(inputTokens, 2048, pricing) : null,
    })
    try {
      const result = await suggestExperiments(
        createAiProvider(selected, { getApiKey: () => getSessionKey(selected.id) }),
        {
          projectId,
          projectName,
          assumption: {
            statement: assumption.statement,
            type: assumption.type,
            impact: assumption.impact,
            risk: assumption.risk,
            confidence: assumption.confidence,
          },
          context,
          signal: controller.signal,
          budgetConfirmed,
        },
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
    }
  }

  function handleRelayApply(data: { experiments: SuggestedExperiment[] }) {
    setPicks(data.experiments)
    setChecked(data.experiments.map(() => true))
    setStage('preview')
  }

  function editPick(index: number, patch: Partial<SuggestedExperiment>) {
    setPicks((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }

  async function handleApply() {
    if (!assumption) return
    const chosen = picks.filter((_, i) => checked[i])
    if (chosen.length === 0) {
      setError('请至少勾选一条要应用的实验。')
      return
    }
    setApplying(true)
    setError(null)
    try {
      const result = await applySuggestedExperiments(projectId, assumption.id, chosen)
      onApplied(result.created, result.skipped)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setApplying(false)
    }
  }

  const assumptionBlock = assumption ? (
    <p className="rounded-lg border border-hairline bg-surface-2 p-3 text-caption text-ink-secondary">
      <span className={`mr-1 inline-block rounded-full px-2 py-0.5 text-caption ${ASSUMPTION_TYPE_META[assumption.type].badgeClass}`}>
        {ASSUMPTION_TYPE_META[assumption.type].label}
      </span>
      {assumption.statement}
    </p>
  ) : null

  return (
    <Dialog
      open
      title="AI 设计验证实验"
      onClose={onClose}
      size={stage === 'relay' ? 'lg' : 'md'}
    >
      {stage === 'config' && (
        <div className="space-y-4">
          <p className="rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-caption text-ink-secondary">
            当前路径：{route === 'byok' ? '内置 AI（BYOK）——应用直接调用你配置的 Provider' : 'Prompt Relay——零配置，复制 Prompt 给外部 AI 助手'}
          </p>

          <div>
            <label htmlFor="ai-exp-assumption" className="text-caption text-ink-muted">
              要验证的假设（必选）
            </label>
            <select
              id="ai-exp-assumption"
              value={assumptionId}
              onChange={(e) => setAssumptionId(e.target.value)}
              className={`${inputClass} min-h-11`}
            >
              <option value="">请选择假设…</option>
              {assumptions.map((a) => (
                <option key={a.id} value={a.id}>
                  [{ASSUMPTION_TYPE_META[a.type].label}]{' '}
                  {a.statement.length > 32 ? `${a.statement.slice(0, 32)}…` : a.statement}
                </option>
              ))}
            </select>
            {assumptionBlock}
            {assumptions.length === 0 && (
              <p className="mt-1 text-caption text-warning">
                本项目还没有假设——先在「假设」页录入或用 AI 识别，再回来设计实验。
              </p>
            )}
          </div>

          {route === 'byok' ? (
            <>
              <div>
                <label htmlFor="ai-exp-provider" className="text-caption text-ink-muted">
                  AI Provider
                </label>
                <select
                  id="ai-exp-provider"
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className={`${inputClass} min-h-11`}
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}（{p.model}）
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ai-exp-key" className="text-caption text-ink-muted">
                  API Key（仅本会话有效）
                </label>
                <input
                  id="ai-exp-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-…"
                  autoComplete="off"
                  className={inputClass}
                />
              </div>
            </>
          ) : null}

          <div>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="ai-exp-context" className="text-caption text-ink-muted">
                补充背景（可选：目标用户、渠道、已有限制…）
              </label>
              <FieldHint
                field="补充背景"
                highlighted={hintsHighlighted}
                onRead={() => void markOnboardingDone('fieldHints').catch(() => undefined)}
                good="只有网页端；没有投广告预算；希望一周内得到结论。"
                bad="随便。"
              />
            </div>
            <textarea
              id="ai-exp-context"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder="例：目标用户是小团队财务；只有网页端；希望一周内得到结论"
              className={inputClass}
            />
          </div>

          {budgetError && (
            <div role="alert" className="rounded-lg border border-warning/40 bg-warning/10 p-3">
              <p className="text-body-sm text-ink">{budgetError}</p>
              <Button className="mt-2" variant="secondary" onClick={() => void handleSuggest(true)}>
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
                onClick={() => void handleSuggest(false)}
                disabled={!assumption || providers.length === 0}
              >
                AI 设计实验
              </Button>
            ) : (
              <Button disabled={!assumption} onClick={() => setStage('relay')}>
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
          <p className="text-body-sm text-ink-secondary">正在为选中假设设计低成本验证实验…</p>
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

      {stage === 'relay' && assumption && (
        <RelayPanel
          promptText={buildExperimentPrompt({
            projectName,
            assumption: {
              statement: assumption.statement,
              type: assumption.type,
              impact: assumption.impact,
              risk: assumption.risk,
              confidence: assumption.confidence,
            },
            context,
          }).relayText}
          schema={experimentSuggestionSchema}
          schemaDescription='{"experiments":[{"hypothesis":"可证伪的实验假设","method":"实验方法与步骤","successCriteria":"含数字的成功阈值"}]，1–3 条'
          taskType="design-experiments"
          onApply={handleRelayApply}
        />
      )}

      {stage === 'preview' && (
        <div className="space-y-4">
          <p className="text-caption text-ink-muted">
            AI 建议先审核再入库：可修改假设、方法与成功阈值；应用后写入实验列表并关联所选假设。
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
                  应用这条实验
                </label>
                <textarea
                  value={pick.hypothesis}
                  onChange={(e) => editPick(i, { hypothesis: e.target.value })}
                  rows={2}
                  maxLength={2000}
                  aria-label={`第 ${i + 1} 条实验假设`}
                  className={`${inputClass} mt-2`}
                />
                <textarea
                  value={pick.method}
                  onChange={(e) => editPick(i, { method: e.target.value })}
                  rows={2}
                  maxLength={1000}
                  aria-label={`第 ${i + 1} 条实验方法`}
                  className={`${inputClass} mt-2`}
                />
                <textarea
                  value={pick.successCriteria}
                  onChange={(e) => editPick(i, { successCriteria: e.target.value })}
                  rows={2}
                  maxLength={2000}
                  aria-label={`第 ${i + 1} 条成功阈值`}
                  className={`${inputClass} mt-2`}
                />
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
            regenerating={false}
            applyLabel="实验"
            onApply={() => void handleApply()}
            onReject={onClose}
            onRegenerate={() => void handleSuggest(false)}
            onBack={() => setStage('config')}
            backLabel="返回修改"
          />
        </div>
      )}
    </Dialog>
  )
}
