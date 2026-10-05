import { clearSessionKeys } from '@/ai/session'
import { db } from '@/db/db'

/**
 * 维护操作（命令 7 用户体验修复）：与「删除单个项目」不同的整机清理。
 * 清除范围刻意区分两级：
 * - clearProductData：只清产品数据（项目/假设/实验/OST/报告/评分审计），
 *   保留应用设置（AI 模式、默认 Provider）、Provider 配置、引导状态与用量账本。
 * - resetApp：回到首次打开状态——另清设置、Provider、引导标记与用量账本；
 *   会话 Key 是内存态，直接清空。
 * 两者的执行结果都不可恢复，调用方（设置页）必须先走 window.confirm。
 */

const PRODUCT_TABLES = [
  db.projects,
  db.assumptions,
  db.experiments,
  db.ost_nodes,
  db.reports,
  db.score_events,
] as const

export async function clearProductData(): Promise<void> {
  await db.transaction('rw', [...PRODUCT_TABLES], async () => {
    for (const table of PRODUCT_TABLES) {
      await table.clear()
    }
  })
}

export async function resetApp(): Promise<void> {
  await db.transaction('rw', [...PRODUCT_TABLES, db.settings, db.ai_providers, db.ai_requests], async () => {
    for (const table of PRODUCT_TABLES) {
      await table.clear()
    }
    await db.settings.clear()
    await db.ai_providers.clear()
    await db.ai_requests.clear()
  })
  clearSessionKeys()
}
