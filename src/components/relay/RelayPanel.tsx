import { useEffect, useState } from 'react'
import type { z } from 'zod'
import { parseRelayResult } from '@/ai/relay/parse'
import { Button } from '@/components/ui/Button'
import { BotIcon, ClipboardIcon, CopyIcon } from '@/components/ui/icons'
import { downloadFile } from '@/lib/download'
import { getOnboarding, markOnboardingDone } from '@/services/onboarding'

interface RelayPanelProps<T> {
  /** 完整 Relay 文本（指令 + 输入 + few-shot），来自 prompt builder。 */
  promptText: string
  schema: z.ZodType<T>
  /** 人类可读的输出 schema 描述，随 discovery-task.json 导出。 */
  schemaDescription: string
  /** 任务类型标记，随 discovery-task.json 导出（任意外部 agent 可懂）。 */
  taskType: string
  onApply: (data: T) => void
}

const RELAY_STEPS = [
  { icon: CopyIcon, title: '复制', body: '点下方「复制 Prompt」，内容已进入剪贴板' },
  { icon: BotIcon, title: '粘给 AI', body: '打开你的 AI 助手（Claude / ChatGPT / 豆包…），粘贴并发送' },
  { icon: ClipboardIcon, title: '粘回结果', body: '整体复制 AI 回复，点「下一步：粘贴结果」粘回这里解析' },
]

const RELAY_EXAMPLE = [
  {
    label: 'Prompt 长这样（节选）：',
    text:
      '你是资深产品发现教练……给定项目背景后，你从八个风险类别中识别出最关键、' +
      '最值得验证的产品假设。……只输出一个 JSON 对象：{"assumptions":[…]}。\n' +
      '## 待处理输入\n项目名称：AI 记账助手\n项目背景与想法：面向自由职业者的…',
  },
  {
    label: 'AI 的回复长这样（解析器兼容围栏/解释文字/字段名变体）：',
    text:
      '好的，这是我识别的假设：\n```json\n{"assumptions":[{"statement":"自由职业者愿意为自动报税整理支付每月 10 元",' +
      '"type":"value","rationale":"付费意愿未经验证","suggestedImpact":4,"suggestedRisk":4}]}\n```',
  },
]

/**
 * Prompt Relay 两阶段面板：先展示/编辑/复制 Prompt（主路径复制粘贴，
 * 辅以 .txt 下载与 discovery-task.json 任务文件导出），再接收粘贴回的
 * 结果并容错解析。解析失败不丢原文——issues 列出问题，textarea 保留
 * 全文供修改后重新解析。
 */
export function RelayPanel<T>({ promptText, schema, schemaDescription, taskType, onApply }: RelayPanelProps<T>) {
  const [stage, setStage] = useState<'prompt' | 'result'>('prompt')
  const [text, setText] = useState(promptText)
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [raw, setRaw] = useState('')
  const [issues, setIssues] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showRelaySteps, setShowRelaySteps] = useState(false)
  const [showExample, setShowExample] = useState(false)

  useEffect(() => {
    let alive = true
    getOnboarding()
      .then((state) => {
        if (alive && !state.promptRelay) setShowRelaySteps(true)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  async function handleCopy() {
    setError(null)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('自动复制失败，请点击文本区域手动全选复制。')
    }
  }

  function handleDownloadTxt() {
    downloadFile(`${taskType}-prompt.txt`, text, 'text/plain;charset=utf-8')
  }

  function handleExportTask() {
    const task = {
      taskType,
      schemaDescription,
      prompt: text,
      exportedAt: new Date().toISOString(),
    }
    downloadFile('discovery-task.json', JSON.stringify(task, null, 2), 'application/json')
  }

  function handleParse() {
    setError(null)
    const result = parseRelayResult(raw, schema)
    if (result.ok) {
      // 首次成功完成 Relay 循环 → 操作引导永不再打扰（失败不算完成）。
      void markOnboardingDone('promptRelay').catch(() => undefined)
      onApply(result.data)
      return
    }
    setIssues(result.issues)
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) setRaw(await file.text())
    event.target.value = ''
  }

  if (stage === 'result') {
    return (
      <div className="space-y-3">
        <p className="text-caption text-ink-muted">
          把外部 AI 助手的回复粘贴到下面（支持纯 JSON、markdown 围栏或带解释文字的回复），然后解析。
        </p>
        <textarea
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value)
            setIssues([])
          }}
          rows={8}
          placeholder='粘贴 AI 回复，例如：{"experiments":[…]}'
          aria-label="粘贴 AI 回复结果"
          className="w-full rounded-btn border border-hairline-strong bg-surface-1 px-3 py-2 font-mono text-body-sm text-ink placeholder:text-ink-faint focus:border-accent-focus focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-btn border border-hairline-strong bg-surface-2 px-4 py-2.5 text-button text-ink hover:bg-surface-3">
            导入结果文件
            <input type="file" accept=".json,.txt" onChange={handleFile} className="sr-only" />
          </label>
          <Button variant="ghost" onClick={() => setStage('prompt')}>
            返回修改 Prompt
          </Button>
        </div>

        {issues.length > 0 && (
          <div role="alert" className="rounded-lg border border-danger/40 bg-danger/5 p-3">
            <p className="text-body-sm font-medium text-danger">解析失败（原文已保留，可修改后重新解析）：</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-caption text-ink-secondary">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        )}
        {error && (
          <p role="alert" className="text-body-sm text-danger">
            {error}
          </p>
        )}

        <Button onClick={handleParse}>解析结果</Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {showRelaySteps && (
        <section aria-label="Prompt Relay 操作引导" className="rounded-lg border border-hairline bg-surface-2 p-3">
          <ol className="grid gap-1.5">
            {RELAY_STEPS.map((s, i) => (
              <li key={s.title} className="flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                  <s.icon size={13} />
                </span>
                <p className="text-caption text-ink">
                  <span className="font-medium">{i + 1}. {s.title}</span>
                  <span className="text-ink-muted"> — {s.body}</span>
                </p>
              </li>
            ))}
          </ol>
          <div className="mt-1.5 flex items-center gap-3">
            <button
              type="button"
              aria-expanded={showExample}
              onClick={() => setShowExample((v) => !v)}
              className="min-h-7 rounded-btn px-2 text-caption text-accent hover:text-accent-hover"
            >
              {showExample ? '收起示例' : '查看示例'}
            </button>
            <button
              type="button"
              onClick={() => setShowRelaySteps(false)}
              className="min-h-7 rounded-btn px-2 text-caption text-ink-faint hover:text-ink"
            >
              知道了
            </button>
          </div>
          {showExample && (
            <div className="mt-2 space-y-2">
              {RELAY_EXAMPLE.map((block) => (
                <div key={block.label}>
                  <p className="text-caption text-ink-muted">{block.label}</p>
                  <pre className="reading-surface mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-btn border border-hairline p-2 font-mono text-xs">
                    {block.text}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      <p className="text-caption text-ink-muted">
        把下面的 Prompt 复制给你的 AI 助手（Claude / ChatGPT / 豆包…），等它回复后点击「粘贴结果」继续。
      </p>
      {editing ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          aria-label="编辑 Prompt"
          className="w-full rounded-btn border border-hairline-strong bg-surface-1 px-3 py-2 font-mono text-body-sm text-ink focus:border-accent-focus focus:outline-none"
        />
      ) : (
        <pre
          className="reading-surface max-h-[34dvh] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-hairline p-3 font-mono text-sm"
        >
          {text}
        </pre>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={handleCopy}>
          {copied ? '已复制' : '复制 Prompt'}
        </Button>
        <Button variant="ghost" onClick={() => setEditing((v) => !v)}>
          {editing ? '完成编辑' : '编辑'}
        </Button>
        <Button variant="ghost" onClick={handleDownloadTxt}>
          下载 .txt
        </Button>
        <Button variant="ghost" onClick={handleExportTask}>
          导出任务文件
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      )}
      <Button onClick={() => setStage('result')}>下一步：粘贴结果</Button>
    </div>
  )
}
