import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AIError, createProvider as createAiProvider, clearSessionKeys, getSessionKey, setSessionKey } from '@/ai'
import { getMonthUsage, listUsageSince, usageSinceIso } from '@/ai/usage'
import { Button } from '@/components/ui/Button'
import type { AiMode } from '@/lib/ai-mode'
import type { ProviderConfigRow } from '@/schemas/entities'
import { listActiveProjects } from '@/services/projects'
import { createProvider, deleteProvider, listProviders, setDefaultProvider } from '@/services/ai-providers'
import { getSettings, updateSettings } from '@/services/settings'
import { confirmAction } from '@/lib/confirm'
import { useT } from '@/lib/i18n'
import { requestCustomEndpointConfirm } from '@/lib/endpoint-guard'
import { ModeSection } from './ai-provider/ModeSection'
import { BudgetSection, type BudgetField } from './ai-provider/BudgetSection'
import { AddProviderForm } from './ai-provider/AddProviderForm'
import { ProviderList } from './ai-provider/ProviderList'
import { UsagePanel } from './ai-provider/UsagePanel'
import type { ProviderKind } from './ai-provider/shared'

const BUDGET_SETTING_FIELDS: Record<BudgetField, 'perRequestBudgetUsd' | 'monthlyBudgetUsd'> = {
  perRequest: 'perRequestBudgetUsd',
  monthly: 'monthlyBudgetUsd',
}

/**
 * 设置 · AI Provider。页面只做「状态 + 副作用 + 组合」：模式、预算、Provider
 * 列表、用量视图都是独立分区组件（见 ./ai-provider/*）。
 */
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
  /** 添加表单的 Key 草稿，创建 Provider 时一并保存到当前会话内存。 */
  const [newKey, setNewKey] = useState('')
  /** 预算输入草稿：用户输入过的字段以草稿为准；'' = 不限（null），onBlur 提交。 */
  const [budgetDrafts, setBudgetDrafts] = useState<Record<string, string>>({})
  const perRequestValue = budgetDrafts.perRequest ?? (settings?.perRequestBudgetUsd != null ? String(settings.perRequestBudgetUsd) : '')
  const monthlyValue = budgetDrafts.monthly ?? (settings?.monthlyBudgetUsd != null ? String(settings.monthlyBudgetUsd) : '')

  const usageRows = useLiveQuery(() => listUsageSince(usageSinceIso()), [])
  const monthUsage = useLiveQuery(() => getMonthUsage(), [])
  const projects = useLiveQuery(() => listActiveProjects(), [])

  async function handleMode(mode: AiMode) {
    setError(null)
    try {
      await updateSettings({ aiMode: mode })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleBudget(field: BudgetField, raw: string) {
    const settingsField = BUDGET_SETTING_FIELDS[field]
    const trimmed = raw.trim()
    if (trimmed === '') {
      await updateSettings({ [settingsField]: null })
      return
    }
    const value = Number(trimmed)
    if (!Number.isFinite(value) || value <= 0) {
      setError(t('settings.aiProvider.budgetInvalid'))
      return
    }
    setError(null)
    await updateSettings({ [settingsField]: value })
    setBudgetDrafts((prev) => {
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  async function handleClearSessionKeys() {
    if (!(await confirmAction({ title: t('confirm.confirmTitle'), body: t('settings.aiProvider.clearSessionKeysConfirm') }))) return
    clearSessionKeys()
    setKeyDrafts({})
    setKeySaved({})
    setKeyTesting({})
    setError(null)
  }

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault()
    if (!(await requestCustomEndpointConfirm(baseUrl.trim()))) return
    setError(null)
    try {
      const row = await createProvider({ label: label.trim(), kind, baseUrl: baseUrl.trim(), model: model.trim() })
      if (!providers || providers.length === 0) await setDefaultProvider(row.id)
      const key = newKey.trim()
      if (key) {
        setSessionKey(row.id, key)
        setKeySaved((prev) => ({ ...prev, [row.id]: true }))
      }
      setShowAdd(false)
      setLabel('')
      setBaseUrl('')
      setModel('')
      setNewKey('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDelete(id: string) {
    if (!(await confirmAction({ title: t('confirm.deleteTitle'), body: t('settings.aiProvider.deleteConfirm'), tone: 'danger' }))) return
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
    setKeyDrafts((prev) => ({ ...prev, [id]: '' }))
  }

  async function handleTestKey(row: ProviderConfigRow) {
    const key = (keyDrafts[row.id] ?? '').trim() || getSessionKey(row.id)
    if (!key) {
      setError(t('settings.aiProvider.keyTestNeedError'))
      return
    }
    if (!(await requestCustomEndpointConfirm(row.baseUrl))) return
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

  function handleKeyDraft(id: string, value: string) {
    setKeyDrafts((prev) => ({ ...prev, [id]: value }))
    setKeySaved((prev) => ({ ...prev, [id]: false }))
    setKeyTesting((prev) => ({ ...prev, [id]: undefined }))
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
        <p className="mt-1 text-body-sm text-ink-muted">{t('settings.aiProvider.desc')}</p>
      </header>

      <ModeSection
        aiMode={settings.aiMode}
        providers={providers}
        defaultProviderId={settings.defaultProviderId}
        onMode={(mode) => void handleMode(mode)}
      />

      <BudgetSection
        perRequestValue={perRequestValue}
        monthlyValue={monthlyValue}
        onDraft={(field, value) => setBudgetDrafts((prev) => ({ ...prev, [field]: value }))}
        onCommit={(field, value) => void handleBudget(field, value)}
      />

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
            onClick={() => void handleClearSessionKeys()}
            className="ml-2 text-caption text-danger underline-offset-2 hover:underline"
          >
            {t('settings.aiProvider.clearSessionKeys')}
          </button>
        </p>

        {showAdd && (
          <AddProviderForm
            label={label}
            kind={kind}
            baseUrl={baseUrl}
            model={model}
            newKey={newKey}
            onLabel={setLabel}
            onKind={setKind}
            onBaseUrl={setBaseUrl}
            onModel={setModel}
            onNewKey={setNewKey}
            onSubmit={(event) => void handleAdd(event)}
          />
        )}

        <ProviderList
          providers={providers}
          defaultProviderId={settings.defaultProviderId}
          keyDrafts={keyDrafts}
          keySaved={keySaved}
          keyTesting={keyTesting}
          onSetDefault={(id) => void setDefaultProvider(id)}
          onDelete={(id) => void handleDelete(id)}
          onKeyDraft={handleKeyDraft}
          onSaveKey={handleSaveKey}
          onTestKey={(row) => void handleTestKey(row)}
        />
      </section>

      <section aria-label={t('settings.aiProvider.usageHeading')} className="space-y-3">
        <h2 className="text-eyebrow text-ink-muted">{t('settings.aiProvider.usageHeading')}</h2>
        {!usageRows || usageRows.length === 0 ? (
          <p className="text-caption text-ink-faint">{t('settings.aiProvider.usageEmpty')}</p>
        ) : (
          <UsagePanel
            rows={usageRows}
            projects={projects ?? []}
            monthUsage={monthUsage ?? null}
            monthlyBudgetUsd={settings?.monthlyBudgetUsd ?? null}
          />
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
