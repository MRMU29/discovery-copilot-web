import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AIError, createProvider as createAiProvider, clearSessionKeys, getSessionKey, setSessionKey, summarizeUsage } from '@/ai'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/common/states'
import { db } from '@/db/db'
import { resolveAiRoute, AI_MODES, type AiMode } from '@/lib/ai-mode'
import type { AiRequest, ProviderConfigRow } from '@/schemas/entities'
import { listActiveProjects } from '@/services/projects'
import { createProvider, deleteProvider, listProviders, setDefaultProvider } from '@/services/ai-providers'
import { getSettings, updateSettings } from '@/services/settings'
import { useT } from '@/lib/i18n'

type ProviderKind = ProviderConfigRow['kind']

const KIND_LABEL_KEYS: Record<ProviderKind, string> = {
  'openai-compatible': 'settings.aiProvider.kindOpenai',
  gemini: 'settings.aiProvider.kindGemini',
}

const MODE_LABEL_KEYS: Record<AiMode, string> = {
  byok: 'settings.aiProvider.mode.byok.label',
  relay: 'settings.aiProvider.mode.relay.label',
  hybrid: 'settings.aiProvider.mode.hybrid.label',
}

const MODE_DESC_KEYS: Record<AiMode, string> = {
  byok: 'settings.aiProvider.mode.byok.desc',
  relay: 'settings.aiProvider.mode.relay.desc',
  hybrid: 'settings.aiProvider.mode.hybrid.desc',
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

const PROMPT_LABEL_KEYS: Record<string, string> = {
  'identify-assumptions': 'settings.aiProvider.prompt.identifyAssumptions',
  'design-experiments': 'settings.aiProvider.prompt.designExperiments',
  chat: 'settings.aiProvider.prompt.chat',
  'chat-json': 'settings.aiProvider.prompt.chatJson',
}

function fmtUsd(usd: number): string {
  return `$${usd.toFixed(4)}`
}

/** §6.4 用量视图：月合计 + 按日汇总 + 最近 20 条明细。 */
function UsageView({ rows, projects }: { rows: AiRequest[]; projects: { id: string; name: string }[] }) {
  const t = useT()
  const summary = summarizeUsage(rows)
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]))
  const details = rows.slice(0, 20)
  return (
    <div className="space-y-4">
      <p className="text-body-sm text-ink">
        {t('settings.aiProvider.usageSummary', {
          count: summary.totalCount,
          input: summary.totalInputTokens.toLocaleString(),
          output: summary.totalOutputTokens.toLocaleString(),
          usd: fmtUsd(summary.totalUsd),
        })}
        <span className="ml-1 text-caption text-ink-faint">{t('settings.aiProvider.usagePricingNote')}</span>
      </p>

      <div className="overflow-x-auto rounded-lg border border-hairline">
        <table className="w-full min-w-[480px] text-left text-caption">
          <thead className="border-b border-hairline bg-surface-2 text-ink-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">{t('settings.aiProvider.usageTableDate')}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t('settings.aiProvider.usageTableRequest')}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t('settings.aiProvider.usageTableTokens')}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t('settings.aiProvider.usageTableUsd')}</th>
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
        <summary className="cursor-pointer text-caption text-ink-secondary">{t('settings.aiProvider.usageDetails', { count: details.length })}</summary>
        <ul className="mt-2 space-y-1.5">
          {details.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-caption text-ink-secondary">
              <span className="text-ink-faint">{row.createdAt.slice(5, 16).replace('T', ' ')}</span>
              <span className="text-ink">{projectNameById.get(row.projectId ?? '') ?? '—'}</span>
              <span>{row.model}</span>
              <span>{t(PROMPT_LABEL_KEYS[row.promptId] ?? row.promptId)}</span>
              <span className={row.status === 'ok' ? 'text-success' : 'text-danger'}>
                {row.status === 'ok' ? t('settings.aiProvider.usageOk') : (row.errorCode ?? t('settings.aiProvider.usageFailed'))}
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
  const t = useT()
  const settings = useLiveQuery(() => getSettings(), [])
  const providers = useLiveQuery(() => listProviders(), [])
  const [showAdd, setShowAdd] = useState(false)
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState<ProviderKind>('openai-compatible')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
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
      setError(t('settings.aiProvider.budgetInvalid'))
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
    if (!window.confirm(t('settings.aiProvider.clearSessionKeysConfirm'))) return
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
      setShowAdd(false)
      setLabel('')
      setBaseUrl('')
      setModel('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t('settings.aiProvider.deleteConfirm'))) return
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
      setError(t('settings.aiProvider.keyEmptyError'))
      return
    }
    setError(null)
    setSessionKey(id, value)
    setKeySaved((prev) => ({ ...prev, [id]: true }))
  }

  async function handleTestKey(row: ProviderConfigRow) {
    const key = (keyDrafts[row.id] ?? '').trim() || getSessionKey(row.id)
    if (!key) {
      setError(t('settings.aiProvider.keyTestNeedError'))
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
        <h1 className="text-headline text-ink">{t('settings.aiProvider.title')}</h1>
        <p className="mt-1 text-body-sm text-ink-muted">
          {t('settings.aiProvider.desc')}
        </p>
      </header>

      <section aria-label={t('settings.aiProvider.modeHeading')} className="space-y-3">
        <h2 className="text-eyebrow text-ink-muted">{t('settings.aiProvider.modeHeading')}</h2>
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
                {t(MODE_LABEL_KEYS[mode])}
              </span>
              <span className="text-caption text-ink-muted">{t(MODE_DESC_KEYS[mode])}</span>
            </label>
          ))}
        </div>
        <p role="status" className="rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-caption text-ink-secondary">
          {t('settings.aiProvider.currentRoutePrefix')}
          {resolveAiRoute(settings.aiMode, providers.length > 0) === 'byok'
            ? providers.length > 0
              ? t('settings.aiProvider.routeByokWith', {
                  label: providers.find((p) => p.id === settings.defaultProviderId)?.label ?? providers[0].label,
                })
              : t('settings.aiProvider.routeByokNone')
            : t('settings.aiProvider.routeRelay')}
        </p>
      </section>

      <section aria-label={t('settings.aiProvider.budgetHeading')} className="space-y-3">
        <h2 className="text-eyebrow text-ink-muted">{t('settings.aiProvider.budgetHeading')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-caption text-ink-muted">
            {t('settings.aiProvider.budgetPerRequest')}
            <input
              type="number"
              min="0"
              step="0.01"
              value={perRequestValue}
              onChange={(e) => setBudgetDrafts((prev) => ({ ...prev, perRequest: e.target.value }))}
              onBlur={(e) => void handleBudget('perRequestBudgetUsd', e.target.value)}
              placeholder={t('settings.aiProvider.budgetPerRequestPlaceholder')}
              className="mt-1 w-full rounded-btn border border-hairline-strong bg-surface-1 px-3 py-2 text-body text-ink placeholder:text-ink-faint focus:border-accent-focus focus:outline-none"
            />
          </label>
          <label className="text-caption text-ink-muted">
            {t('settings.aiProvider.budgetMonthly')}
            <input
              type="number"
              min="0"
              step="0.5"
              value={monthlyValue}
              onChange={(e) => setBudgetDrafts((prev) => ({ ...prev, monthly: e.target.value }))}
              onBlur={(e) => void handleBudget('monthlyBudgetUsd', e.target.value)}
              placeholder={t('settings.aiProvider.budgetMonthlyPlaceholder')}
              className="mt-1 w-full rounded-btn border border-hairline-strong bg-surface-1 px-3 py-2 text-body text-ink placeholder:text-ink-faint focus:border-accent-focus focus:outline-none"
            />
          </label>
        </div>
        <p className="text-caption text-ink-faint">
          {t('settings.aiProvider.budgetHint')}
        </p>
      </section>

      <section aria-label={t('settings.aiProvider.providersHeading')} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-eyebrow text-ink-muted">{t('settings.aiProvider.providersHeading')}</h2>
          <Button variant="secondary" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? t('settings.aiProvider.cancelAdd') : t('settings.aiProvider.add')}
          </Button>
        </div>

        <p className="text-caption text-ink-faint">
          {t('settings.aiProvider.sessionKeyNote')}{' '}
          <button
            type="button"
            onClick={handleClearSessionKeys}
            className="ml-2 text-caption text-danger underline-offset-2 hover:underline"
          >
            {t('settings.aiProvider.clearSessionKeys')}
          </button>
        </p>

        {showAdd && (
          <form onSubmit={handleAdd} className="space-y-3 rounded-lg border border-hairline bg-surface-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-caption text-ink-muted">{t('settings.aiProvider.presetsLabel')}</span>
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
                  {t('settings.aiProvider.fieldLabel')}
                </label>
                <input
                  id="provider-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={t('settings.aiProvider.fieldLabelPlaceholder')}
                  maxLength={60}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="provider-kind" className="text-caption text-ink-muted">
                  {t('settings.aiProvider.fieldKind')}
                </label>
                <select
                  id="provider-kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as ProviderKind)}
                  className={`${inputClass} min-h-11`}
                >
                  {(Object.keys(KIND_LABEL_KEYS) as ProviderKind[]).map((k) => (
                    <option key={k} value={k}>
                      {t(KIND_LABEL_KEYS[k])}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="provider-base-url" className="text-caption text-ink-muted">
                {t('settings.aiProvider.fieldBaseUrl')}
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
                {t('settings.aiProvider.fieldModel')}
              </label>
              <input
                id="provider-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="deepseek-chat"
                className={inputClass}
              />
            </div>
            <p className="rounded-lg border border-hairline bg-surface-1 px-3 py-2 text-caption text-ink-muted">
              {t('settings.aiProvider.noKeyNote')}
            </p>
            <Button type="submit" disabled={!label.trim() || !baseUrl.trim() || !model.trim()}>
              {t('common.save')}
            </Button>
          </form>
        )}

        {providers.length === 0 ? (
          <EmptyState
            title={t('settings.aiProvider.emptyTitle')}
            description={t('settings.aiProvider.emptyDesc')}
          />
        ) : (
          <ul className="space-y-3">
            {providers.map((p) => (
              <li key={p.id} className={cardClass}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-card-title text-ink">{p.label}</p>
                  {settings.defaultProviderId === p.id && (
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-caption text-ink">{t('settings.aiProvider.defaultBadge')}</span>
                  )}
                  <span className="ml-auto flex gap-2">
                    {settings.defaultProviderId !== p.id && (
                      <Button variant="ghost" onClick={() => void setDefaultProvider(p.id)}>
                        {t('settings.aiProvider.setDefault')}
                      </Button>
                    )}
                    <Button variant="danger" onClick={() => void handleDelete(p.id)}>
                      删除
                    </Button>
                  </span>
                </div>
                <p className="mt-1 text-caption text-ink-muted">
                  {t(KIND_LABEL_KEYS[p.kind])} · {p.baseUrl} · {p.model}
                </p>
                <div className="mt-3 space-y-2 border-t border-hairline pt-3">
                  <label htmlFor={`provider-key-${p.id}`} className="text-caption text-ink-muted">
                    {t('settings.aiProvider.keyLabel')}
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
                      placeholder={keySaved[p.id] ? t('settings.aiProvider.keySavedPlaceholder') : 'sk-…'}
                      autoComplete="off"
                      className="min-h-11 flex-1 rounded-btn border border-hairline-strong bg-surface-1 px-3 text-body text-ink placeholder:text-ink-faint focus:border-accent-focus focus:outline-none"
                    />
                    <Button variant="secondary" onClick={() => handleSaveKey(p.id)}>
                      {t('settings.aiProvider.saveKey')}
                    </Button>
                    <Button variant="ghost" onClick={() => void handleTestKey(p)} disabled={keyTesting[p.id] === 'busy'}>
                      {keyTesting[p.id] === 'busy' ? t('settings.aiProvider.testing') : t('settings.aiProvider.testConnection')}
                    </Button>
                  </div>
                  {keyTesting[p.id] === 'ok' && <p className="text-caption text-success">{t('settings.aiProvider.testOk')}</p>}
                  {keyTesting[p.id] === 'fail' && <p className="text-caption text-danger">{t('settings.aiProvider.testFail')}</p>}
                  {keySaved[p.id] && keyTesting[p.id] === undefined && (
                    <p className="text-caption text-ink-faint">{t('settings.aiProvider.keySavedNote')}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label={t('settings.aiProvider.usageHeading')} className="space-y-3">
        <h2 className="text-eyebrow text-ink-muted">{t('settings.aiProvider.usageHeading')}</h2>
        {!usageRows || usageRows.length === 0 ? (
          <p className="text-caption text-ink-faint">
            {t('settings.aiProvider.usageEmpty')}
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
