import { useState } from 'react'
import { markOnboardingDone } from '@/services/onboarding'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { BotIcon, ClipboardIcon, CopyIcon } from '@/components/ui/icons'
import { BRAND_ICON_URL } from '@/lib/brand'
import { useT } from '@/lib/i18n'

const FLOW_STEPS = ['welcome.flow.idea', 'welcome.flow.assumption', 'welcome.flow.priority', 'welcome.flow.experiments', 'welcome.flow.ost', 'welcome.flow.report']

const RELAY_STEPS = [
  { icon: CopyIcon, titleKey: 'welcome.relay1.title', bodyKey: 'welcome.relay1.body' },
  { icon: BotIcon, titleKey: 'welcome.relay2.title', bodyKey: 'welcome.relay2.body' },
  { icon: ClipboardIcon, titleKey: 'welcome.relay3.title', bodyKey: 'welcome.relay3.body' },
]

const ZERO_CONFIG_KEYS = ['welcome.zero1', 'welcome.zero2', 'welcome.zero3']

interface WelcomeDialogProps {
  onClose: () => void
}

/**
 * 新手指引第一层：首次进入的 3 屏欢迎引导。任何出口（跳过/开始/随便看看）
 * 都标记 welcome 完成——非强制，之后可在设置页重新查看。
 */
export function WelcomeDialog({ onClose }: WelcomeDialogProps) {
  const t = useT()
  const [step, setStep] = useState(0)
  const [closing, setClosing] = useState(false)

  async function finish() {
    setClosing(true)
    try {
      await markOnboardingDone('welcome')
    } catch {
      // 引导状态写失败不阻断关闭
    }
    onClose()
  }

  return (
    <Dialog open title={step === 0 ? t('welcome.title1') : step === 1 ? t('welcome.title2') : t('welcome.title3')} onClose={finish}>
      <div className="space-y-5">
        {step === 0 && (
          <>
            <div className="flex items-center gap-4">
              <img
                src={BRAND_ICON_URL}
                alt=""
                className="h-14 w-14 shrink-0 rounded-xl border border-hairline shadow-card"
              />
              <p className="text-body text-ink">{t('welcome.intro')}</p>
            </div>
            <div>
              <p className="text-caption text-ink-muted">{t('welcome.flowCaption')}</p>
              <ol className="mt-2 flex flex-wrap items-center gap-1.5 text-caption">
                {FLOW_STEPS.map((label, i) => (
                  <li key={label} className="flex items-center gap-1.5">
                    {i > 0 && <span aria-hidden className="text-ink-faint">→</span>}
                    <span
                      className={`rounded-full px-2.5 py-1 ${
                        i < 3 ? 'bg-accent/15 text-ink' : 'border border-hairline bg-surface-2 text-ink-secondary'
                      }`}
                    >
                      {t(label)}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}

        {step === 1 && (
          <ol className="space-y-3">
            {RELAY_STEPS.map((s, i) => (
              <li key={s.titleKey} className="flex gap-3 rounded-lg border border-hairline bg-surface-2 p-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                  <s.icon size={18} />
                </span>
                <div>
                  <p className="text-body-sm font-medium text-ink">{t('welcome.relayStep', { n: i + 1, title: t(s.titleKey) })}</p>
                  <p className="mt-0.5 text-caption text-ink-muted">{t(s.bodyKey)}</p>
                </div>
              </li>
            ))}
          </ol>
        )}

        {step === 2 && (
          <>
            <ul className="space-y-2">
              {ZERO_CONFIG_KEYS.map((key) => (
                <li key={key} className="flex items-start gap-2 text-body-sm text-ink">
                  <span aria-hidden className="mt-0.5 text-success">✓</span>
                  {t(key)}
                </li>
              ))}
            </ul>
            <p className="text-caption text-ink-faint">
              {t('welcome.whereToStart')}
            </p>
          </>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
              {t('welcome.prev')}
            </Button>
          )}
          {step < 2 ? (
            <>
              <Button onClick={() => setStep((s) => s + 1)}>{t('welcome.next')}</Button>
              <button
                type="button"
                onClick={finish}
                className="ml-auto min-h-11 rounded-btn px-3 text-caption text-ink-faint hover:text-ink"
              >
                {t('welcome.skip')}
              </button>
            </>
          ) : (
            <>
              <Button onClick={finish}>{t('welcome.start')}</Button>
              <Button variant="secondary" onClick={finish}>
                {t('welcome.explore')}
              </Button>
            </>
          )}
        </div>

        <div className="flex justify-center gap-1.5" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`h-1.5 w-6 rounded-full ${i === step ? 'bg-accent' : 'bg-surface-3'}`}
            />
          ))}
        </div>
        <p className="sr-only">{t('welcome.progress', { n: step + 1, total: 3 })}</p>
        {closing && <p className="sr-only">{t('welcome.saving')}</p>}
      </div>
    </Dialog>
  )
}
