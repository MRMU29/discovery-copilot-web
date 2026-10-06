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
  // 初始化 = 回到首次打开状态：除清表外还要归还存储配额——只 clear() 表时
  // 浏览器（尤其 Chrome）不一定立刻回收磁盘空间，且 localStorage 里的报告
  // 草稿等残留仍在占用。关闭连接后删除整个数据库，再清 origin 级 KV 存储。
  await wipeOriginStorage()
}

/**
 * Origin-wide wipe used by resetApp: close the Dexie connection (otherwise
 * deleteDatabase blocks forever — see HANDOFF §8), drop the whole database,
 * then clear key-value stores / Cache Storage. The caller reloads immediately
 * after, so open liveQuery subscriptions that lose their connection mid-flight
 * never paint. Best-effort by design: every step tolerates a missing API.
 */
async function wipeOriginStorage(): Promise<void> {
  try {
    db.close()
  } catch {
    // already closed — nothing to do
  }
  await deleteDatabaseWithTimeout(db.name)
  try {
    localStorage.clear()
  } catch {
    // private mode / storage disabled
  }
  try {
    sessionStorage.clear()
  } catch {
    // private mode / storage disabled
  }
  if (typeof caches !== 'undefined') {
    try {
      const names = await caches.keys()
      await Promise.all(names.map((name) => caches.delete(name)))
    } catch {
      // Cache API unavailable — nothing cached by this app anyway
    }
  }
}

/** deleteDatabase that never hangs: onblocked/bounded timeout resolves either way. */
async function deleteDatabaseWithTimeout(name: string, timeoutMs = 2000): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  await new Promise<void>((resolve) => {
    let settled = false
    const done = () => {
      if (!settled) {
        settled = true
        resolve()
      }
    }
    try {
      const request = indexedDB.deleteDatabase(name)
      request.onsuccess = done
      request.onerror = done
      // Another tab may still hold a connection; don't wait forever.
      request.onblocked = done
      setTimeout(done, timeoutMs)
    } catch {
      done()
    }
  })
}
