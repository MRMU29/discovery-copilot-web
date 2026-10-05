import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { downloadFile } from '@/lib/download'
import { resetOnboarding } from '@/services/onboarding'
import { resetApp } from '@/services/maintenance'
import { buildDiagnosticReport, diagnosticsFileName, type DiagnosticReport } from '@/services/diagnostics'

export default function About() {
  const navigate = useNavigate()
  const [resetting, setResetting] = useState(false)
  const [wiping, setWiping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [diagPending, setDiagPending] = useState<DiagnosticReport | null>(null)
  const [diagBusy, setDiagBusy] = useState(false)

  async function handleReplayOnboarding() {
    setResetting(true)
    setError(null)
    try {
      await resetOnboarding()
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setResetting(false)
    }
  }

  async function handlePreviewDiagnostics() {
    setDiagBusy(true)
    setError(null)
    try {
      setDiagPending(await buildDiagnosticReport())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDiagBusy(false)
    }
  }

  function handleExportDiagnostics(report: DiagnosticReport) {
    downloadFile(diagnosticsFileName(), JSON.stringify(report, null, 2), 'application/json')
    setDiagPending(null)
  }

  async function handleResetApp() {
    if (!window.confirm('重置应用到首次打开状态？将清除全部项目数据、设置、Provider 与引导状态——不可恢复。')) return
    if (!window.confirm('再次确认：真的要初始化整个应用吗？')) return
    setWiping(true)
    setError(null)
    try {
      await resetApp()
      navigate('/')
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setWiping(false)
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-headline text-ink">关于</h2>
      <div className="rounded-lg border border-hairline bg-surface-1 p-6">
        <p className="text-card-title text-ink">Discovery Copilot</p>
        <p className="mt-1 text-body-sm text-ink-muted">
          版本 {__APP_VERSION__} · 无账号的本地优先产品发现工作台
        </p>
        <dl className="mt-4 space-y-1 text-body-sm text-ink-secondary">
          <div>
            <dt className="inline text-ink-faint">技术栈：</dt>
            <dd className="inline"> React 18 · Vite · Dexie (IndexedDB) · Tailwind CSS 4</dd>
          </div>
          <div>
            <dt className="inline text-ink-faint">构建：</dt>
            <dd className="inline"> 本地优先 · 文件可迁移（.dcopilot）· BYOK / Prompt Relay</dd>
          </div>
        </dl>
      </div>

      <section aria-label="新手指引" className="rounded-lg border border-hairline bg-surface-1 p-6">
        <p className="text-card-title text-ink">新手指引</p>
        <p className="mt-1 text-body-sm text-ink-muted">
          重看欢迎引导与填写示例，并重置全部引导状态（字段提示、Relay 三步引导将重新出现）。
        </p>
        <Button className="mt-3" variant="secondary" onClick={() => void handleReplayOnboarding()} disabled={resetting}>
          {resetting ? '重置中…' : '重新查看新手指引'}
        </Button>
        {error && (
          <p role="alert" className="mt-2 text-body-sm text-danger">
            {error}
          </p>
        )}
      </section>

      <section aria-label="诊断包" className="rounded-lg border border-hairline bg-surface-1 p-6">
        <p className="text-card-title text-ink">诊断包</p>
        <p className="mt-1 text-body-sm text-ink-muted">
          导出脱敏元数据用于问题反馈：应用/格式版本、浏览器环境、存储概况与最近 50 条 AI 请求元数据。
          不含 API Key、Prompt 正文或任何项目数据；导出前可预览全部内容。
        </p>
        <Button className="mt-3" variant="secondary" onClick={() => void handlePreviewDiagnostics()} disabled={diagBusy}>
          {diagBusy ? '生成中…' : '预览诊断包…'}
        </Button>
      </section>

      <section aria-label="素材与开源" className="rounded-lg border border-hairline bg-surface-1 p-6">
        <p className="text-card-title text-ink">素材与开源来源</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-body-sm text-ink-secondary">
          <li>应用图标：项目自有素材（public/brand-icon.jpg）。</li>
          <li>界面图标：自绘内联 SVG（src/components/ui/icons.tsx），无第三方素材。</li>
          <li>开源依赖清单以 package.json 为准；源码仓库：
            <a
              href="https://github.com/MRMU29/discovery-copilot-web"
              target="_blank"
              rel="noreferrer"
              className="text-accent underline underline-offset-2"
            >
              github.com/MRMU29/discovery-copilot-web
            </a>
          </li>
        </ul>
      </section>

      <section aria-label="初始化" className="rounded-lg border border-danger/40 bg-surface-1 p-6">
        <p className="text-card-title text-danger">初始化应用</p>
        <p className="mt-1 text-body-sm text-ink-secondary">
          回到首次打开状态：清除全部项目数据、应用设置（含 AI 模式）、Provider 配置与引导状态。
          此操作不可恢复——建议先在「数据与备份」导出 .dcopilot。
        </p>
        <Button className="mt-3" variant="danger" onClick={() => void handleResetApp()} disabled={wiping}>
          {wiping ? '重置中…' : '重置应用…'}
        </Button>
      </section>

      <Dialog
        open={diagPending !== null}
        title="诊断包预览"
        onClose={() => setDiagPending(null)}
        size="lg"
      >
        {diagPending && (
          <div className="space-y-3">
            <p className="text-caption text-ink-muted">
              以下为文件的全部内容（{diagPending.aiRequests.length} 条 AI 请求元数据）。确认无误后再导出。
            </p>
            <pre className="max-h-[46dvh] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-hairline bg-surface-2 p-3 font-mono text-xs text-ink">
              {JSON.stringify(diagPending, null, 2)}
            </pre>
            <div className="flex gap-2">
              <Button onClick={() => handleExportDiagnostics(diagPending)}>确认导出</Button>
              <Button variant="ghost" onClick={() => setDiagPending(null)}>
                取消
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
