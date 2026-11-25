import { useT } from '@/lib/i18n'
import {
  PROMPT_DETAILS,
  PROMPT_TONES,
  type PromptOptions,
} from '@/ai/prompts/options'

/**
 * The only prompt knobs the product exposes (§v0.2.4): tone and detail.
 * Language follows the UI and is not a user choice here. Compact segmented
 * buttons so three dialogs (identify / experiment / report) can reuse it.
 */
export function PromptOptionsControl({
  value,
  onChange,
  disabled = false,
}: {
  value: PromptOptions
  onChange: (next: PromptOptions) => void
  disabled?: boolean
}) {
  const t = useT()

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <fieldset className="min-w-0">
        <legend className="text-caption text-ink-muted">{t('ai.prompt.tone.label')}</legend>
        <div
          role="group"
          aria-label={t('ai.prompt.tone.label')}
          className="mt-1 flex rounded-btn border border-hairline-strong p-0.5"
        >
          {PROMPT_TONES.map((tone) => (
            <button
              key={tone}
              type="button"
              disabled={disabled}
              aria-pressed={value.tone === tone}
              onClick={() => onChange({ ...value, tone })}
              className={`flex min-h-9 flex-1 items-center justify-center rounded-btn px-2 text-caption transition-colors ${
                value.tone === tone ? 'bg-accent text-white' : 'text-ink-secondary hover:text-ink'
              }`}
            >
              {t(`ai.prompt.tone.${tone}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="min-w-0">
        <legend className="text-caption text-ink-muted">{t('ai.prompt.detail.label')}</legend>
        <div
          role="group"
          aria-label={t('ai.prompt.detail.label')}
          className="mt-1 flex rounded-btn border border-hairline-strong p-0.5"
        >
          {PROMPT_DETAILS.map((detail) => (
            <button
              key={detail}
              type="button"
              disabled={disabled}
              aria-pressed={value.detail === detail}
              onClick={() => onChange({ ...value, detail })}
              className={`flex min-h-9 flex-1 items-center justify-center rounded-btn px-2 text-caption transition-colors ${
                value.detail === detail ? 'bg-accent text-white' : 'text-ink-secondary hover:text-ink'
              }`}
            >
              {t(`ai.prompt.detail.${detail}`)}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  )
}
