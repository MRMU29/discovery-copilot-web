import { useState } from 'react'
import { markOnboardingDone } from '@/services/onboarding'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { BotIcon, ClipboardIcon, CopyIcon } from '@/components/ui/icons'
import { BRAND_ICON_URL } from '@/lib/brand'

const FLOW_STEPS = ['想法', '假设', '优先级', '实验', 'OST', '报告']

const RELAY_STEPS = [
  {
    icon: CopyIcon,
    title: '填写并生成 Prompt',
    body: '新建项目、写清想法，进入「AI 识别」点击生成——应用产出一份结构化 Prompt。',
  },
  {
    icon: BotIcon,
    title: '粘贴给你的 AI',
    body: '复制 Prompt，发给 Claude / ChatGPT / 豆包 等任意 AI 助手，等它回复。',
  },
  {
    icon: ClipboardIcon,
    title: '把结果粘回来',
    body: '整体复制 AI 回复，粘贴到应用里点「解析结果」，自动整理成假设与实验。',
  },
]

const ZERO_CONFIG_POINTS = [
  '不需要注册账号，打开就能用',
  '不需要 API Key——AI 任务通过 Prompt Relay 完成',
  '全部数据保存在你自己的浏览器里，可随时导出 .dcopilot 迁移',
]

interface WelcomeDialogProps {
  onClose: () => void
}

/**
 * 新手指引第一层：首次进入的 3 屏欢迎引导。任何出口（跳过/开始/随便看看）
 * 都标记 welcome 完成——非强制，之后可在设置页重新查看。
 */
export function WelcomeDialog({ onClose }: WelcomeDialogProps) {
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
    <Dialog open title={step === 0 ? '欢迎来到 Discovery Copilot' : step === 1 ? '怎么用：三步完成一次发现' : '你需要的只是浏览器'} onClose={finish}>
      <div className="space-y-5">
        {step === 0 && (
          <>
            <div className="flex items-center gap-4">
              <img
                src={BRAND_ICON_URL}
                alt=""
                className="h-14 w-14 shrink-0 rounded-xl border border-hairline shadow-card"
              />
              <p className="text-body text-ink">
                把模糊的产品想法，变成<strong className="text-ink">可验证的假设</strong>和
                <strong className="text-ink">实验计划</strong>——一个跑在你浏览器里的产品发现工作台。
              </p>
            </div>
            <div>
              <p className="text-caption text-ink-muted">完整流程（本引导只带你走完前半段，其余随时可探索）：</p>
              <ol className="mt-2 flex flex-wrap items-center gap-1.5 text-caption">
                {FLOW_STEPS.map((label, i) => (
                  <li key={label} className="flex items-center gap-1.5">
                    {i > 0 && <span aria-hidden className="text-ink-faint">→</span>}
                    <span
                      className={`rounded-full px-2.5 py-1 ${
                        i < 3 ? 'bg-accent/15 text-ink' : 'border border-hairline bg-surface-2 text-ink-secondary'
                      }`}
                    >
                      {label}
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
              <li key={s.title} className="flex gap-3 rounded-lg border border-hairline bg-surface-2 p-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                  <s.icon size={18} />
                </span>
                <div>
                  <p className="text-body-sm font-medium text-ink">
                    第 {i + 1} 步 · {s.title}
                  </p>
                  <p className="mt-0.5 text-caption text-ink-muted">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        )}

        {step === 2 && (
          <>
            <ul className="space-y-2">
              {ZERO_CONFIG_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-2 text-body-sm text-ink">
                  <span aria-hidden className="mt-0.5 text-success">✓</span>
                  {point}
                </li>
              ))}
            </ul>
            <p className="text-caption text-ink-faint">
              不确定从哪开始？首页可以一键加载一个完整示例项目，先看看每个页面最终长什么样。
            </p>
          </>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
              上一步
            </Button>
          )}
          {step < 2 ? (
            <>
              <Button onClick={() => setStep((s) => s + 1)}>下一步</Button>
              <button
                type="button"
                onClick={finish}
                className="ml-auto min-h-11 rounded-btn px-3 text-caption text-ink-faint hover:text-ink"
              >
                跳过指引
              </button>
            </>
          ) : (
            <>
              <Button onClick={finish}>开始第一个项目</Button>
              <Button variant="secondary" onClick={finish}>
                先随便看看
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
        <p className="sr-only">第 {step + 1} 屏，共 3 屏</p>
        {closing && <p className="sr-only">正在保存引导状态…</p>}
      </div>
    </Dialog>
  )
}
