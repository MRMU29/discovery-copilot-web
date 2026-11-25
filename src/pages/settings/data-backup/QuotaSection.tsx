import { Button } from '@/components/ui/Button'
import { useT } from '@/lib/i18n'
import type { QuotaReport } from '@/db/quota'

function formatBytes(bytes: number | null): string {
  return bytes != null ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : '—'
}

export interface QuotaSectionProps {
  quota: QuotaReport | null
  persist: 'idle' | 'granted' | 'denied'
  onRequestPersist: () => void
}

/** 存储配额与持久化授权：只读展示 + 一个申请按钮。 */
export function QuotaSection({ quota, persist, onRequestPersist }: QuotaSectionProps) {
  const t = useT()
  return (
    <section aria-label={t('settings.dataBackup.quotaHeading')} className="rounded-lg border border-hairline bg-surface-1 p-4">
      <h3 className="text-eyebrow text-ink-muted">{t('settings.dataBackup.quotaHeading')}</h3>
      <p className="mt-2 text-body text-ink">
        {t('settings.dataBackup.quotaUsage', {
          used: quota?.usage != null ? formatBytes(quota.usage) : t('settings.dataBackup.unknown'),
          quota: quota?.quota != null ? formatBytes(quota.quota) : t('settings.dataBackup.unknown'),
        })}
      </p>
      <p className="mt-1 text-caption text-ink-faint">{t('settings.dataBackup.quotaNote')}</p>
      {quota?.low && (
        <p role="status" className="mt-2 text-body-sm text-warning">
          {t('settings.dataBackup.quotaLow')}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={onRequestPersist}>
          {t('settings.dataBackup.requestPersistent')}
        </Button>
        {persist === 'granted' && <span className="text-body-sm text-success">{t('settings.dataBackup.persistGranted')}</span>}
        {persist === 'denied' && (
          <span className="text-body-sm text-ink-muted">{t('settings.dataBackup.persistDenied')}</span>
        )}
      </div>
    </section>
  )
}
