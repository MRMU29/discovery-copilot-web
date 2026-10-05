#!/usr/bin/env node
/**
 * Pre-validation probe ① — Provider CORS matrix (plan v2.1 §14-①).
 *
 * Answers, without any API key, whether each candidate AI provider can be
 * called directly from the browser: a browser can read a response only when
 * it carries a permissive `access-control-allow-origin`, and a POST with the
 * `authorization` header must first survive an OPTIONS preflight. Both can
 * be observed keylessly because providers attach CORS headers even to 401/400
 * error responses.
 *
 * Usage:
 *   node scripts/probe/provider-cors.mjs                # write JSON matrix
 *   node scripts/probe/provider-cors.mjs --insecure     # ALSO accept MITM/self-signed certs
 *                                                       # (corporate-proxy diagnostic only;
 *                                                       #  results are then labelled untrusted)
 * Output: docs/research/provider-cors.json (raw) — the human report is
 * docs/research/provider-cors.md, authored from this JSON.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

if (process.argv.includes('--insecure')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}

const ORIGIN = 'https://discovery-copilot.local'
const TIMEOUT_MS = 15_000

const PROVIDERS = [
  { name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1/chat/completions', note: 'OpenAI-compatible' },
  { name: 'OpenAI', endpoint: 'https://api.openai.com/v1/chat/completions', note: 'OpenAI-compatible reference' },
  { name: 'Moonshot Kimi', endpoint: 'https://api.moonshot.cn/v1/chat/completions', note: 'OpenAI-compatible' },
  { name: 'Zhipu GLM', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', note: 'OpenAI-compatible' },
  {
    name: 'Google Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    note: 'Gemini-style, key-as-query-param',
  },
]

function headersOf(res) {
  const pick = (n) => res.headers.get(n)
  return {
    statusCode: res.status,
    'access-control-allow-origin': pick('access-control-allow-origin'),
    'access-control-allow-methods': pick('access-control-allow-methods'),
    'access-control-allow-headers': pick('access-control-allow-headers'),
    'access-control-allow-credentials': pick('access-control-allow-credentials'),
    'access-control-max-age': pick('access-control-max-age'),
  }
}

function originAllowed(acao) {
  if (!acao) return false
  return acao.trim() === '*' || acao.trim() === ORIGIN
}

async function attempt(url, init) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), ...init })
    return { kind: 'response', ...headersOf(res) }
  } catch (err) {
    const cause = err?.cause ? ` (${err.cause.code ?? err.cause.message})` : ''
    return { kind: 'error', error: `${err.name}: ${err.message}${cause}` }
  }
}

const insecure = process.argv.includes('--insecure')
const results = []
for (const p of PROVIDERS) {
  const preflight = await attempt(p.endpoint, {
    method: 'OPTIONS',
    headers: {
      Origin: ORIGIN,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type',
    },
  })
  const post = await attempt(p.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ model: 'probe', messages: [] }),
  })
  const postReadable = post.kind === 'response' && originAllowed(post['access-control-allow-origin'])
  const preflightOk = preflight.kind === 'response' && originAllowed(preflight['access-control-allow-origin'])
  const verdict =
    post.kind === 'error'
      ? insecure && /CERT|TLS/i.test(post.error ?? '')
        ? 'unknown — TLS intercepted (see error); rerun outside the proxy or verify manually'
        : 'unreachable from this machine — check network/proxy'
      : postReadable
        ? preflightOk
          ? 'DIRECT — browser直连可行（预检与响应均可读）'
          : 'PARTIAL — 响应可读但预检未通过：简单请求可能可行，带 authorization 头的调用不可行'
        : 'BLOCKED — 无 access-control-allow-origin，浏览器直连不可用，需代理'

  results.push({ provider: p.name, note: p.note, endpoint: p.endpoint, verdict, preflight, post })
  console.log(`\n=== ${p.name} — ${verdict}`)
  console.log('  preflight:', JSON.stringify(preflight))
  console.log('  POST    :', JSON.stringify(post))
}

const payload = {
  generatedAt: new Date().toISOString(),
  origin: ORIGIN,
  insecureMode: insecure,
  results,
}
const outDir = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/research')
mkdirSync(outDir, { recursive: true })
const outPath = join(outDir, 'provider-cors.json')
writeFileSync(outPath, JSON.stringify(payload, null, 2))
console.log(`\nJSON matrix written to ${outPath}`)
