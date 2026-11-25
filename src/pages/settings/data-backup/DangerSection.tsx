import { Button } from '@/components/ui/Button'
import { useT } from '@/lib/i18n'

export interface DangerSectionProps {
  notice: string | null
  error: string | null
  clearing: boolean
  onClear: () => void
}

/** 危险区：清空产品数据（不进回收站，二次确认在调用方）。 */
export function DangerSection({ notice, error, clearing, onClear }: DangerSectionProps) {
  const t = useT()
  return (
    <section aria-label={t('settings.dataBackup.dangerHeading')} className="rounded-lg border border-danger/40 bg-surface-1 p-4">
      <h3 className="text-eyebrow text-danger">{t('settings.dataBackup.dangerHeading')}</h3>
      <p className="mt-2 text-body-sm text-ink-secondary">{t('settings.dataBackup.dangerDesc')}</p>
      {notice && (
        <p role="status" className="mt-2 text-body-sm text-success">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-body-sm text-danger">
          {error}
        </p>
      )}
      <Button className="mt-3" variant="danger" onClick={onClear} disabled={clearing}>
        {clearing ? t('settings.dataBackup.clearing') : t('settings.dataBackup.clearData')}
      </Button>
    </section>
  )
}
