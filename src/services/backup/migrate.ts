import { translate } from '@/lib/i18n'
import { DCOPILT_FORMAT_VERSION } from './schema'

interface MigrationStep {
  from: number
  migrate: (raw: Record<string, unknown>) => Record<string, unknown>
}

/**
 * AC-11 migration chain, applied stepwise until the file reaches
 * DCOPILT_FORMAT_VERSION. v0 = the command-1 probe-era payload that lacked
 * the reports/settings keys. Register future versions here — never rewrite
 * history, only append.
 */
const MIGRATIONS: MigrationStep[] = [
  {
    from: 0,
    migrate: (raw) => ({ reports: [], settings: null, ...raw, formatVersion: 1 }),
  },
  {
    from: 1,
    // v2 只新增可选能力：老文件补一个空决策表即可，绝不改写既有行。
    migrate: (raw) => ({ ...raw, decisions: [], formatVersion: 2 }),
  },
]

export function migrateFile(raw: Record<string, unknown>): { file: Record<string, unknown> } | { issues: string[] } {
  const declared = typeof raw.formatVersion === 'number' ? raw.formatVersion : Number.NaN
  if (Number.isInteger(declared) && declared > DCOPILT_FORMAT_VERSION) {
    return {
      issues: [
        translate('backup.versionTooNew', { declared, supported: DCOPILT_FORMAT_VERSION }),
      ],
    }
  }
  if (!Number.isInteger(declared)) return { file: raw } // schema validation reports this properly
  let version = declared
  let current = raw
  for (const step of [...MIGRATIONS].sort((a, b) => a.from - b.from)) {
    if (version === step.from) {
      current = step.migrate(current)
      version = step.from + 1
    }
  }
  return { file: current }
}
