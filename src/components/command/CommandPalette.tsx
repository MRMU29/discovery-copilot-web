import { useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Dialog } from '@/components/ui/Dialog'
import { projectPath } from '@/app/nav'
import { downloadFile } from '@/lib/download'
import { nowIso } from '@/lib/clock'
import { useT } from '@/lib/i18n'
import { listActiveProjects } from '@/services/projects'
import { buildDcopilotFile, dcopilotFileName } from '@/services/backup'
import { updateSettings } from '@/services/settings'

interface PaletteItem {
  id: string
  label: string
  hint?: string
  disabled?: boolean
  run: () => void | Promise<void>
}

/**
 * ⌘/Ctrl+K command palette (§v0.2.4). Actions are deliberately few and local:
 * navigation, one creation shortcut, a backup export and the theme toggle. It
 * reuses Dialog for focus trapping; the search box gets first focus via
 * `initialFocus` so typing works immediately.
 */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const projectRows = useLiveQuery(() => listActiveProjects(), [])
  const projectId = /^\/project\/([^/]+)/.exec(location.pathname)?.[1] ?? null

  const items = useMemo<PaletteItem[]>(() => {
    const actions: PaletteItem[] = [
      {
        id: 'new-assumption',
        label: t('palette.newAssumption'),
        hint: projectId ? undefined : t('palette.needProject'),
        disabled: !projectId,
        run: () => {
          if (!projectId) return
          navigate(`${projectPath(projectId, 'assumptions')}?new=assumption`)
        },
      },
      {
        id: 'export-backup',
        label: t('palette.exportBackup'),
        run: async () => {
          const file = await buildDcopilotFile('all')
          downloadFile(dcopilotFileName(t('dashboard.title')), JSON.stringify(file, null, 2), 'application/json')
          await updateSettings({ lastBackupAt: nowIso() }).catch(() => undefined)
        },
      },
      {
        id: 'toggle-theme',
        label: t('palette.toggleTheme'),
        run: async () => {
          const dark = document.documentElement.dataset.theme === 'dark'
          await updateSettings({ theme: dark ? 'light' : 'dark' })
        },
      },
    ]

    const projectItems: PaletteItem[] = [...(projectRows ?? [])]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((project) => ({
        id: `project-${project.id}`,
        label: project.name,
        hint: t('palette.projectHint'),
        run: () => navigate(projectPath(project.id)),
      }))

    const q = query.trim().toLowerCase()
    if (!q) return [...actions, ...projectItems.slice(0, 5)]
    return [...actions, ...projectItems].filter((item) => item.label.toLowerCase().includes(q))
  }, [navigate, projectId, projectRows, query, t])

  const clamped = Math.min(active, Math.max(0, items.length - 1))

  function activate(item: PaletteItem | undefined) {
    if (!item || item.disabled) return
    onClose()
    void item.run()
  }

  return (
    <Dialog open title={t('palette.title')} onClose={onClose} initialFocus={searchRef}>
      <div className="space-y-3">
        <input
          ref={searchRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActive((current) => Math.min(current + 1, items.length - 1))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActive((current) => Math.max(current - 1, 0))
            } else if (event.key === 'Enter') {
              event.preventDefault()
              activate(items[clamped])
            }
          }}
          placeholder={t('palette.placeholder')}
          aria-label={t('palette.placeholder')}
          className="w-full rounded-btn border border-hairline-strong bg-surface-1 px-3 py-2 text-body text-ink placeholder:text-ink-faint focus:border-accent-focus focus:outline-none"
        />

        {items.length === 0 ? (
          <p className="px-1 py-6 text-center text-body-sm text-ink-faint">{t('palette.empty')}</p>
        ) : (
          <ul role="listbox" aria-label={t('palette.title')} className="max-h-80 space-y-1 overflow-auto">
            {items.map((item, index) => (
              <li key={item.id} role="option" aria-selected={index === clamped}>
                <button
                  type="button"
                  disabled={item.disabled}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => activate(item)}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-btn px-3 text-left text-body-sm transition-colors ${
                    index === clamped ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-surface-2'
                  } ${item.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.hint && <span className="shrink-0 text-caption text-ink-faint">{item.hint}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="text-caption text-ink-faint">{t('palette.footerHint')}</p>
      </div>
    </Dialog>
  )
}
