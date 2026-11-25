import { translate } from '@/lib/i18n'
import { confirmAction } from '@/lib/confirm'

/**
 * Shared guard for BYOK endpoints. Unknown hosts are still allowed — the app
 * deliberately cannot predict which provider a user configures — but a Key
 * must never be sent to one without an explicit, domain-naming confirmation.
 * Every "create Provider" entry point calls this before createProvider().
 */

const KNOWN_ENDPOINT_HOSTS = new Set([
  'api.deepseek.com',
  'api.moonshot.cn',
  'open.bigmodel.cn',
  'api.siliconflow.cn',
  'generativelanguage.googleapis.com',
])

function customEndpointHost(baseUrl: string): string | null {
  try {
    const host = new URL(baseUrl).hostname
    return KNOWN_ENDPOINT_HOSTS.has(host) ? null : host
  } catch {
    return null // 非法 URL 交给 providerConfigWriteSchema 拒绝
  }
}

/**
 * Resolves true when the caller may proceed. Named `request…` (not `assert…`)
 * on purpose: a Promise<boolean> that is used without await is always truthy,
 * so the async boundary must be impossible to miss at the call site.
 */
export function requestCustomEndpointConfirm(baseUrl: string): Promise<boolean> {
  const host = customEndpointHost(baseUrl)
  if (!host) return Promise.resolve(true)
  return confirmAction({
    title: translate('confirm.confirmTitle'),
    body: translate('settings.aiProvider.customEndpointConfirm', { host }),
  })
}
