#!/usr/bin/env node
/**
 * prepare-release.mjs — 把 Discovery-Copilot-WEB 复制为独立发布仓库目录。
 *
 * 排除：依赖/构建产物/缓存/日志 + 一切工作区内部材料。复制后自动校验
 * 发布树不含内部材料与用户数据，并统计文件数。
 *
 *   node scripts/prepare-release.mjs [targetDir]
 *   默认 targetDir = ../discovery-copilot-web（相对 WEB 根）
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = process.cwd()
const APP_NAME = 'discovery-copilot-web'
// Default target sits OUTSIDE the workspace: <parent-of-workspace>/discovery-copilot-web
const TARGET = resolve(process.argv[2] ?? join(ROOT, '..', '..', APP_NAME))

// 排除清单：构建/依赖/缓存/日志 + 工作区内部材料（双保险——上层目录本就不复制）
const EXCLUDE = new Set([
  'node_modules', 'dist', 'dist-ssr', 'coverage', '.vite', '.cache',
  'playwright-report', 'test-results', '.vercel', '.wrangler',
  'AGENTS.md', 'HANDOFF.md', 'docs', '.scratch', '.zcode', '.zcodeignore',
  'pnpm-lock.yaml.bak',
])
const EXCLUDE_FILE_RE = /\.(log|dcopilot|sqlitedb|tsbuildinfo)$/

if (existsSync(TARGET)) {
  rmSync(TARGET, { recursive: true, force: true })
}
mkdirSync(TARGET, { recursive: true })

let copied = 0
function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const name = entry.name
    if (EXCLUDE.has(name) || EXCLUDE_FILE_RE.test(name)) continue
    const s = join(src, name)
    const d = join(dest, name)
    if (entry.isDirectory()) copyDir(s, d)
    else {
      cpSync(s, d)
      copied += 1
    }
  }
}
copyDir(ROOT, TARGET)

// ---- 校验：发布树必须零内部材料、零用户数据、零密钥形态 ----
const problems = []
const FORBIDDEN_NAMES = new Set(['AGENTS.md', 'HANDOFF.md', 'docs', '.scratch', '.zcode', 'acceptance-cmd11.md', 'acceptance-cmd12.md', 'review-report.md'])
const SECRET_RES = [
  { name: 'OpenAI-style key', re: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: 'GitHub token', re: /\b(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}\b/ },
  { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
]

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (FORBIDDEN_NAMES.has(entry.name) || entry.name === 'node_modules') problems.push(`禁入条目: ${full}`)
      else walk(full)
      continue
    }
    if (/\.(dcopilot|sqlitedb|log)$/.test(entry.name)) problems.push(`禁入文件: ${full}`)
    if (statSync(full).size > 2_000_000) continue
    let text
    try {
      text = readFileSync(full, 'utf8')
    } catch {
      continue
    }
    for (const { name, re } of SECRET_RES) {
      if (re.test(text)) problems.push(`${name} 疑似命中: ${full}`)
    }
  }
}
walk(TARGET)

if (problems.length > 0) {
  console.error(`[prepare-release] FAIL — ${problems.length} 处校验命中：`)
  for (const p of problems) console.error(`  ✗ ${p}`)
  process.exit(1)
}

console.log(`[prepare-release] OK — ${copied} 个文件复制到 ${TARGET}；校验通过（零内部材料 / 零用户数据 / 零密钥形态）。`)
