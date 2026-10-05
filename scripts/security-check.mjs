#!/usr/bin/env node
/**
 * Release safety gate (发布前安全检查): fails loudly if tracked files look
 * like secrets, key material, private docs or user data exports. Run via
 * `pnpm security:check` — wired into the release flow before any push.
 */
import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const failures = []

// 1) Tracked files must never match sensitive path patterns.
//    (.env.example is the sanctioned placeholder — explicitly exempt.)
const SENSITIVE_PATH_RE =
  /(^|\/)(\.env(\..*)?|.*\.pem|.*\.key|.*\.p12|.*\.pfx|secrets\..*|.*\.dcopilot|.*\.sqlitedb)$/i
const SENSITIVE_PATH_EXEMPT = /(^|\/)\.env\.example$/i

// 2) File contents must never match real credential shapes (length-gated so
//    words like "task-" / "risk-" cannot false-positive).
const SECRET_CONTENT_RES = [
  { name: 'OpenAI-style key', re: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: 'GitHub token', re: /\b(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}\b/ },
  { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Anthropic key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
]

const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean)

for (const file of tracked) {
  if (SENSITIVE_PATH_RE.test(file) && !SENSITIVE_PATH_EXEMPT.test(file)) {
    failures.push(`敏感路径被跟踪: ${file}`)
  }
}

// 3) Internal workspace material must not be tracked in the PUBLIC repo.
//    Only enforced when the scanned repo root IS the app dir (release copy).
//    In the workspace the app lives beside AGENTS/HANDOFF/docs by design.
const repoRoot = execSync('git rev-parse --show-toplevel', { cwd: ROOT, encoding: 'utf8' }).trim()
const isReleaseRepo = repoRoot.toLowerCase().endsWith('discovery-copilot-web')
if (isReleaseRepo) {
  for (const file of tracked) {
    if (/(^|\/)(AGENTS\.md|HANDOFF\.md)$/.test(file) || /(^|\/)(acceptance-cmd|review-report)/.test(file)) {
      failures.push(`内部材料被跟踪: ${file}`)
    }
    if (/(^|\/)docs\//.test(file)) {
      failures.push(`工作区文档不应进入发布仓库: ${file}`)
    }
  }
}

// 4) Content scan on text sources (skip lockfiles & minified dist).
const CONTENT_SCAN_SKIP = /(?:^|\/)(?:pnpm-lock\.yaml|dist\/|coverage\/|node_modules\/)/
let scanned = 0
for (const file of tracked) {
  if (CONTENT_SCAN_SKIP.test(file)) continue
  const full = join(ROOT, file)
  if (!existsSync(full)) continue
  let text
  try {
    text = readFileSync(full, 'utf8')
  } catch {
    continue // binary
  }
  scanned += 1
  for (const { name, re } of SECRET_CONTENT_RES) {
    const lines = text.split('\n')
    lines.forEach((line, i) => {
      if (re.test(line)) failures.push(`${name} 疑似命中: ${file}:${i + 1}`)
    })
  }
}

if (failures.length > 0) {
  console.error(`\n[security:check] FAIL — ${failures.length} 处命中：\n`)
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}

console.log(`[security:check] OK — ${tracked.length} 个跟踪文件（内容扫描 ${scanned} 个），未发现密钥形态、敏感路径或内部材料。`)
