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
import { buildReportPrompt } from '@/ai/prompts/builders'
import { AIReviewActions } from '@/components/ai/AIReviewActions'
import { RelayPanel } from '@/components/relay/RelayPanel'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { resolveAiRoute } from '@/lib/ai-mode'
import { renderMarkdown } from '@/lib/markdown'
import type { ProviderConfigRow, Report } from '@/schemas/entities'
import { listAssumptionsByProject } from '@/services/assumptions'
import {
  applyReportDraft,
  buildReportContext,
  deriveSections,
  generateReport,
  reportResultSchema,
  type ReportDraft,
} from '@/services/report-ai'
import { listExperimentsByProject } from '@/services/experiments'
import { listOstNodesByProject } from '@/services/ost'
import {
  createProvider,
  listProviders,
  resolveDefaultProvider,
  setDefaultProvider,
} from '@/services/ai-providers'
import { getSettings } from '@/services/settings'

type Stage = 'config' | 'running' | 'relay' | 'preview'
type ProviderKind = 'openai-compatible' | 'gemini'
type DraftOrigin = 'byok' | 'relay'

const KIND_LABELS: Record<ProviderKind, string> = {
  'openai-compatible': 'OpenAI 兼容（DeepSeek / Kimi / GLM…）',
  gemini: 'Gemini',
}

interface AIReportDialogProps {
  projectId: string
  projectName?: string
  /** Present = AI 重写模式：审核后覆盖更新这份报告而不是新建。 */
  targetReport?: Report
  onClose: () => void
  onApplied: (report: Report, mode: 'created' | 'updated') => void
}

const inputClass =
  'mt-1 w-full rounded-btn border border-hairline-strong bg-surface-1 px-3 py-2 text-body text-ink placeholder:text-ink-faint focus:border-accent-focus focus:outline-none'

/**
 * Mounted only while open — every local state starts fresh on mount.
 * Unlike identify/experiment, the model's input is the project's confirmed
 * data (auto-aggregated), so the config stage has no context textarea.
 */
export function AIReportDialog({ projectId, projectName, targetReport, onClose, onApplied }: AIReportDialogProps) {
  const dialogTitle = targetReport ? 'AI 重写发现报告' : 'AI 生成发现报告'
  const [stage, setStage] = useState<Stage>('config')
  const [providers, setProviders] = useState<ProviderConfigRow[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [testState, setTestState] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [aiMode, setAiMode] = useState<'byok' | 'relay' | 'hybrid'>('relay')
  const [context, setContext] = useState('')
  const [draft, setDraft] = useState<ReportDraft | null>(null)
  const [origin, setOrigin] = useState<DraftOrigin>('byok')
  const [renderView, setRenderView] = useState<'render' | 'source'>('render')
  const [busy, setBusy] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [budgetError, setBudgetError] = useState<string | null>(null)
  const [estimate, setEstimate] = useState<{ inputTokens: number; usd: number | null } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [showNewProvider, setShowNewProvider] = useState(false)
  const [npLabel, setNpLabel] = useState('')
  const [npKind, setNpKind] = useState<ProviderKind>('openai-compatible')
  const [npBaseUrl, setNpBaseUrl] = useState('')
  const [npModel, setNpModel] = useState('')

  const stats = useLiveQuery(async () => {
    const [assumptions, experiments, nodes] = await Promise.all([
      listAssumptionsByProject(projectId),
      listExperimentsByProject(projectId),
      listOstNodesByProject(projectId),
    ])
    return { assumptions: assumptions.length, experiments: experiments.length, nodes: nodes.length }
  }, [projectId])

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
  const noData = stats !== undefined && stats.assumptions === 0 && stats.experiments === 0

  async function refreshProviders() {
    const [rows, fallback] = await Promise.all([listProviders(), resolveDefaultProvider()])
    setProviders(rows)
    setSelectedId(fallback?.id ?? rows[0]?.id ?? '')
  }

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

  /** Aggregated once per dialog session; both BYOK and Relay reuse it. */
  async function ensureContext(): Promise<string | null> {
    if (context) return context
    try {
      const ctx = await buildReportContext(projectId)
      setContext(ctx)
      return ctx
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return null
    }
  }

  async function handleGenerate(budgetConfirmed = false) {
    if (!selected || !ensureKey()) return
    const ctx = await ensureContext()
    if (!ctx) return
    const controller = new AbortController()
    abortRef.current = controller
    setOrigin('byok')
    setStage('running')
    setBusy(true)
    setError(null)
    setBudgetError(null)
    // §6.4 请求前预估（输入侧）：报告输出较长，按 maxTokens 4096 计。
    const pricing = resolvePricing(selected.model)
    const bundle = buildReportPrompt({ projectName, context: ctx })
    const inputTokens = estimateMessagesTokens([
      { content: bundle.instruction },
      { content: bundle.inputBlock },
    ])
    setEstimate({
      inputTokens,
      usd: pricing ? estimateCostUsd(inputTokens, 4096, pricing) : null,
    })
    try {
      const result = await generateReport(
        createAiProvider(selected, { getApiKey: () => getSessionKey(selected.id) }),
        { projectId, projectName, context: ctx, signal: controller.signal, budgetConfirmed },
      )
      setDraft(result.data)
      setRenderView('render')
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

  async function handleRelayPrompt() {
    setError(null)
    const ctx = await ensureContext()
    if (!ctx) return
    setStage('relay')
  }

  function editDraft(patch: Partial<ReportDraft>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  async function handleApply() {
    if (!draft) return
    setApplying(true)
    setError(null)
    try {
      const report = await applyReportDraft(projectId, draft, targetReport?.id)
      onApplied(report, targetReport ? 'updated' : 'created')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setApplying(false)
    }
  }

  function handleRegenerate() {
    if (origin === 'relay') {
      // Relay drafts can only be re-run externally — back to the prompt stage.
      void handleRelayPrompt()
      return
    }
    void handleGenerate(false)
  }

  const derivedSections = draft ? deriveSections(draft.content) : []

  return (
    <Dialog
      open
      title={dialogTitle}
      onClose={onClose}
      size={stage === 'relay' ? 'lg' : 'md'}
    >
      {stage === 'config' && (
        <div className="space-y-4">
          <p className="rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-caption text-ink-secondary">
            当前路径：{route === 'byok' ? '内置 AI（BYOK）——应用直接调用你配置的 Provider' : 'Prompt Relay——零配置，复制 Prompt 给外部 AI 助手'}
          </p>

          {targetReport && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-caption text-ink">
              将覆盖重写「{targetReport.title}」——应用 AI 草稿后原内容被替换；应用前仍需你审核确认。
            </div>
          )}

          <div className="rounded-lg border border-hairline bg-surface-2 p-3 text-caption text-ink-secondary">
            <p className="font-medium text-ink">报告将只基于你已确认的项目数据撰写：</p>
            {stats ? (
              <p className="mt-1">
                关键假设 {stats.assumptions} 条 · 验证实验 {stats.experiments} 条 · OST 节点 {stats.nodes} 个
              </p>
            ) : (
              <p className="mt-1">正在统计项目数据…</p>
            )}
            <p className="mt-1 text-ink-faint">AI 负责组织与成文，不会虚构假设、实验或数字。</p>
          </div>

          {route === 'byok' &&
            (providers.length > 0 && !showNewProvider ? (
              <div>
                <label htmlFor="report-provider-select" className="text-caption text-ink-muted">
                  AI Provider
                </label>
                <select
                  id="report-provider-select"
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
                    <label htmlFor="report-np-label" className="text-caption text-ink-muted">
                      名称
                    </label>
                    <input
                      id="report-np-label"
                      value={npLabel}
                      onChange={(e) => setNpLabel(e.target.value)}
                      placeholder="例：DeepSeek"
                      maxLength={60}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="report-np-kind" className="text-caption text-ink-muted">
                      类型
                    </label>
                    <select
                      id="report-np-kind"
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
                  <label htmlFor="report-np-base-url" className="text-caption text-ink-muted">
                    Base URL
                  </label>
                  <input
                    id="report-np-base-url"
                    value={npBaseUrl}
                    onChange={(e) => setNpBaseUrl(e.target.value)}
                    placeholder="https://api.deepseek.com/v1"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="report-np-model" className="text-caption text-ink-muted">
                    模型
                  </label>
                  <input
                    id="report-np-model"
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
                <label htmlFor="report-api-key" className="text-caption text-ink-muted">
                  API Key（仅本会话有效）
                </label>
                <input
                  id="report-api-key"
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

          {budgetError && (
            <div role="alert" className="rounded-lg border border-warning/40 bg-warning/10 p-3">
              <p className="text-body-sm text-ink">{budgetError}</p>
              <Button className="mt-2" variant="secondary" onClick={() => void handleGenerate(true)}>
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
                onClick={() => void handleGenerate(false)}
                disabled={busy || noData || providers.length === 0 || showNewProvider}
              >
                开始生成
              </Button>
            ) : (
              <Button onClick={() => void handleRelayPrompt()} disabled={noData}>
                生成 Prompt
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              关闭
            </Button>
          </div>
          {noData && (
            <p className="text-caption text-ink-faint">
              项目还没有假设或实验——先完成识别与实验设计，报告才有内容可写。
            </p>
          )}
        </div>
      )}

      {stage === 'running' && (
        <div className="flex flex-col items-center gap-4 py-10" role="status">
          <div
            aria-hidden
            className="size-8 animate-spin rounded-full border-2 border-hairline-strong border-t-accent"
          />
          <p className="text-body-sm text-ink-secondary">正在基于项目数据撰写发现报告…</p>
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

      {stage === 'relay' && context && (
        <RelayPanel
          promptText={buildReportPrompt({ projectName, context }).relayText}
          schema={reportResultSchema}
          schemaDescription='{"title":"报告标题","sections":["背景","假设优先级","结论与下一步"],"content":"## 背景\\n……\\n## 结论与下一步\\n……"}（content 为完整 Markdown 正文，2–6 个「## 」节）'
          taskType="generate-report"
          onApply={(data) => {
            setOrigin('relay')
            setDraft(data)
            setRenderView('render')
            setStage('preview')
          }}
        />
      )}

      {stage === 'preview' && draft && (
        <div className="space-y-4">
          <p className="text-caption text-ink-muted">
            AI 草稿先审核再入库：对照项目数据检查有无虚构，可直接修改标题与正文；应用后生成记录会标注「AI 生成」。
          </p>
          <div>
            <label htmlFor="report-draft-title" className="text-caption text-ink-muted">
              报告标题
            </label>
            <input
              id="report-draft-title"
              value={draft.title}
              onChange={(e) => editDraft({ title: e.target.value })}
              maxLength={200}
              className={inputClass}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={renderView === 'render' ? 'secondary' : 'ghost'}
              onClick={() => setRenderView('render')}
            >
              预览
            </Button>
            <Button
              variant={renderView === 'source' ? 'secondary' : 'ghost'}
              onClick={() => setRenderView('source')}
            >
              编辑源码
            </Button>
          </div>

          {renderView === 'render' ? (
            <div
              aria-label="报告预览"
              className="reading-surface reading-prose max-h-[46dvh] overflow-y-auto rounded-lg border border-hairline p-5"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(draft.content) }}
            />
          ) : (
            <textarea
              value={draft.content}
              onChange={(e) => editDraft({ content: e.target.value })}
              rows={12}
              aria-label="报告 Markdown 源码"
              className={`${inputClass} mt-0 font-mono text-body-sm`}
            />
          )}

          {derivedSections.length > 0 && (
            <p className="text-caption text-ink-faint">
              将标记为 AI 生成的节：{derivedSections.join('、')}
            </p>
          )}

          {error && (
            <p role="alert" className="text-body-sm text-danger">
              {error}
            </p>
          )}

          <AIReviewActions
            count={1}
            total={1}
            onToggleAll={() => undefined}
            selectable={false}
            applying={applying}
            regenerating={busy}
            applyLabel="报告"
            applyText={applying ? '应用中…' : targetReport ? '覆盖重写本报告' : '应用为报告'}
            onApply={() => void handleApply()}
            onReject={onClose}
            onRegenerate={handleRegenerate}
            onBack={() => setStage('config')}
            backLabel="返回配置"
          />
        </div>
      )}
    </Dialog>
  )
}
