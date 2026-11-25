import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/common/states'
import { useT } from '@/lib/i18n'
import type { ProviderConfigRow } from '@/schemas/entities'
import { KIND_LABEL_KEYS, cardClass } from './shared'

export type KeyTestState = 'ok' | 'fail' | 'busy' | undefined

export interface ProviderListProps {
  providers: ProviderConfigRow[]
  defaultProviderId: string | null
  keyDrafts: Record<string, string>
  keySaved: Record<string, boolean>
  keyTesting: Record<string, KeyTestState>
  onSetDefault: (id: string) => void
  onDelete: (id: string) => void
  onKeyDraft: (id: string, value: string) => void
  onSaveKey: (id: string) => void
  onTestKey: (row: ProviderConfigRow) => void
}

/** Provider 卡片列表：每张卡片管自己的会话 Key 输入/保存/测试状态。 */
export function ProviderList({
  providers,
  defaultProviderId,
  keyDrafts,
  keySaved,
  keyTesting,
  onSetDefault,
  onDelete,
  onKeyDraft,
  onSaveKey,
  onTestKey,
}: ProviderListProps) {
  const t = useT()
  if (providers.length === 0) {
    return <EmptyState title={t('settings.aiProvider.emptyTitle')} description={t('settings.aiProvider.emptyDesc')} />
  }
  return (
    <ul className="space-y-3">
      {providers.map((p) => (
        <li key={p.id} className={cardClass}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-card-title text-ink">{p.label}</p>
            {defaultProviderId === p.id && (
              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-caption text-ink">
                {t('settings.aiProvider.defaultBadge')}
              </span>
            )}
            <span className="ml-auto flex gap-2">
              {defaultProviderId !== p.id && (
                <Button variant="ghost" onClick={() => onSetDefault(p.id)}>
                  {t('settings.aiProvider.setDefault')}
                </Button>
              )}
              <Button variant="danger" onClick={() => onDelete(p.id)}>
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
                onChange={(e) => onKeyDraft(p.id, e.target.value)}
                placeholder={keySaved[p.id] ? t('settings.aiProvider.keySavedPlaceholder') : 'sk-…'}
                autoComplete="off"
                className="min-h-11 flex-1 rounded-btn border border-hairline-strong bg-surface-1 px-3 text-body text-ink placeholder:text-ink-faint focus:border-accent-focus focus:outline-none"
              />
              <Button variant="secondary" onClick={() => onSaveKey(p.id)}>
                {t('settings.aiProvider.saveKey')}
              </Button>
              <Button variant="ghost" onClick={() => onTestKey(p)} disabled={keyTesting[p.id] === 'busy'}>
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
  )
}
