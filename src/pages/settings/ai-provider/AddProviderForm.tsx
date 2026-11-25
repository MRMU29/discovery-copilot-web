import { Button } from '@/components/ui/Button'
import { useT } from '@/lib/i18n'
import { KIND_LABEL_KEYS, inputClass, type ProviderKind } from './shared'

export interface AddProviderFormProps {
  label: string
  kind: ProviderKind
  baseUrl: string
  model: string
  newKey: string
  onLabel: (next: string) => void
  onKind: (next: ProviderKind) => void
  onBaseUrl: (next: string) => void
  onModel: (next: string) => void
  onNewKey: (next: string) => void
  onSubmit: (event: React.FormEvent) => void
}

/** 新增 Provider 表单（不联网探测；Key 只进会话内存）。 */
export function AddProviderForm({
  label,
  kind,
  baseUrl,
  model,
  newKey,
  onLabel,
  onKind,
  onBaseUrl,
  onModel,
  onNewKey,
  onSubmit,
}: AddProviderFormProps) {
  const t = useT()
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-hairline bg-surface-2 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="provider-label" className="text-caption text-ink-muted">
            {t('settings.aiProvider.fieldLabel')}
          </label>
          <input
            id="provider-label"
            value={label}
            onChange={(e) => onLabel(e.target.value)}
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
            onChange={(e) => onKind(e.target.value as ProviderKind)}
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
          onChange={(e) => onBaseUrl(e.target.value)}
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
          onChange={(e) => onModel(e.target.value)}
          placeholder={t('settings.aiProvider.modelPlaceholder')}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="provider-key-new" className="text-caption text-ink-muted">
          {t('settings.aiProvider.addKeyLabel')}
        </label>
        <input
          id="provider-key-new"
          type="password"
          value={newKey}
          onChange={(e) => onNewKey(e.target.value)}
          placeholder="sk-…"
          autoComplete="off"
          className={inputClass}
        />
      </div>
      <div className="rounded-lg border border-hairline bg-surface-1 px-3 py-2 text-caption text-ink-muted">
        <p>{t('settings.aiProvider.noKeyNote')}</p>
        <p className="mt-1 text-warning">{t('settings.aiProvider.browserRiskNote')}</p>
      </div>
      <Button type="submit" disabled={!label.trim() || !baseUrl.trim() || !model.trim()}>
        {t('common.save')}
      </Button>
    </form>
  )
}
