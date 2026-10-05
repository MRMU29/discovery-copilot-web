import { z } from 'zod'
import { db } from '@/db/db'

/**
 * 新手指引状态（命令 7）：存 settings 表第二行 key='onboarding'，与 key='app'
 * 的应用设置互不干扰，零 db migration。这是**本地设备状态**——表达「这台
 * 浏览器上的用户看过哪些引导」，不表达产品数据本身，因此**不随 .dcopilot
 * 导出**（命令 10 实现导出时须排除本行）。
 */

export const ONBOARDING_STEPS = ['welcome', 'fieldHints', 'promptRelay'] as const

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

const onboardingRowSchema = z.object({
  key: z.literal('onboarding'),
  /** 欢迎引导已完成或跳过。 */
  welcome: z.boolean().default(false),
  /** 字段级填写引导已通过首次成功提交或「知道了」读完。 */
  fieldHints: z.boolean().default(false),
  /** Relay 三步操作引导已通过首次成功解析读完。 */
  promptRelay: z.boolean().default(false),
})

export type OnboardingState = Omit<z.infer<typeof onboardingRowSchema>, 'key'>

const ONBOARDING_KEY = 'onboarding'

/** settings 表按强类型承载 SettingsRow；onboarding 是第二类行，走无类型表引用。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const onboardingTable = db.table('settings') as any

export async function getOnboarding(): Promise<OnboardingState> {
  const row = await onboardingTable.get(ONBOARDING_KEY)
  if (!row) return { welcome: false, fieldHints: false, promptRelay: false }
  const parsed = onboardingRowSchema.parse(row)
  return { welcome: parsed.welcome, fieldHints: parsed.fieldHints, promptRelay: parsed.promptRelay }
}

export async function markOnboardingDone(step: OnboardingStep): Promise<void> {
  const current = await getOnboarding()
  await onboardingTable.put({ ...current, [step]: true, key: ONBOARDING_KEY })
}

export async function resetOnboarding(): Promise<OnboardingState> {
  const next: OnboardingState = { welcome: false, fieldHints: false, promptRelay: false }
  await onboardingTable.put({ ...next, key: ONBOARDING_KEY })
  return next
}
