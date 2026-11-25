import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { downloadFile } from '@/lib/download'
import { useT } from '@/lib/i18n'
import { buildProjectPackage } from '@/services/project-package'

/**
 * Project-package entry (§v0.2.4). One button, one file: the dialog explains
 * what leaves the browser and refuses (rather than truncates) above 2 MB.
 */
export function ProjectPackageDialog({
  projectId,
  open,
  onClose,
}: {
  projectId: string
  open: boolean
  onClose: () => void
}) {
  const t = useT()
  const [building, setBuilding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleBuild() {
    setBuilding(true)
    setError(null)
    try {
      const result = await buildProjectPackage(projectId)
      if (!result.ok) {
        setError(
          result.reason === 'too-large'
            ? t('package.tooLarge', { mb: (result.bytes / 1024 / 1024).toFixed(2) })
            : t('package.failed', { message: result.reason }),
        )
        return
      }
      downloadFile(result.fileName, result.html, 'text/html;charset=utf-8')
      onClose()
    } catch (err) {
      setError(t('package.failed', { message: err instanceof Error ? err.message : String(err) }))
    } finally {
      setBuilding(false)
    }
  }

  return (
    <Dialog open={open} title={t('package.dialogTitle')} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-body-sm text-ink-secondary">{t('package.dialogDesc')}</p>
        {error && (
          <p role="alert" className="text-body-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void handleBuild()} disabled={building}>
            {building ? t('package.building') : t('package.download')}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={building}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
