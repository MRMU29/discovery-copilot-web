import { useT } from '@/lib/i18n'
import { AI_MODES, resolveAiRoute, type AiMode } from '@/lib/ai-mode'
import type { ProviderConfigRow } from '@/schemas/entities'

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

export interface ModeSectionProps {
  aiMode: AiMode
  providers: ProviderConfigRow[]
  defaultProviderId: string | null
  onMode: (mode: AiMode) => void
}

/** AI 模式三选一（即改即存）+ 当前实际路由提示。 */
export function ModeSection({ aiMode, providers, defaultProviderId, onMode }: ModeSectionProps) {
  const t = useT()
  return (
    <section aria-label={t('settings.aiProvider.modeHeading')} className="space-y-3">
      <h2 className="text-eyebrow text-ink-muted">{t('settings.aiProvider.modeHeading')}</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {AI_MODES.map((mode) => (
          <label
            key={mode}
            className={`flex min-h-11 cursor-pointer flex-col gap-1 rounded-lg border p-4 transition-colors ${
              aiMode === mode ? 'border-accent ring-1 ring-accent' : 'border-hairline bg-surface-1 hover:bg-surface-2'
            }`}
          >
            <span className="flex items-center gap-2 text-body text-ink">
              <input
                type="radio"
                name="ai-mode"
                value={mode}
                checked={aiMode === mode}
                onChange={() => onMode(mode)}
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
        {resolveAiRoute(aiMode, providers.length > 0) === 'byok'
          ? providers.length > 0
            ? t('settings.aiProvider.routeByokWith', {
                label: providers.find((p) => p.id === defaultProviderId)?.label ?? providers[0].label,
              })
            : t('settings.aiProvider.routeByokNone')
          : t('settings.aiProvider.routeRelay')}
      </p>
    </section>
  )
}
