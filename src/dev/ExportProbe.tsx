import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'

/**
 * Probe ② of the pre-validation trio: renders a worst-case export sample
 * (long Chinese copy + gradient + hairline table + SVG chart) and lets a
 * human trigger html-to-image PNG capture. Its verdict decides whether PNG
 * export enters P0 or stays best-effort (plan §14-②, §12 修订 #14).
 */
export function ExportProbe() {
  const targetRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'idle' | 'working' | 'ok' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function capture() {
    const node = targetRef.current
    if (!node) return
    setStatus('working')
    try {
      const dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: true })
      const link = document.createElement('a')
      link.download = 'dcopilot-export-probe.png'
      link.href = dataUrl
      link.click()
      setStatus('ok')
      setMessage('已导出 dcopilot-export-probe.png，请对照页面目验中文、渐变、表格与图形保真度。')
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-eyebrow text-accent-muted">PRE-VALIDATION PROBE ②</p>
          <h1 className="text-headline">PNG 导出保真样张</h1>
        </div>
        <button
          type="button"
          onClick={capture}
          disabled={status === 'working'}
          className="rounded-btn bg-accent px-4 py-2 text-button text-white disabled:opacity-60"
        >
          {status === 'working' ? '生成中…' : '导出 PNG'}
        </button>
      </header>

      {message && (
        <p
          className={`text-body-sm ${status === 'error' ? 'text-danger' : 'text-success'}`}
          role="status"
        >
          {message}
        </p>
      )}

      <div ref={targetRef} className="reading-surface overflow-hidden rounded-lg shadow-card">
        <div
          className="px-6 py-8"
          style={{
            background: 'linear-gradient(135deg, #5e6ad2 0%, #828fff 55%, #010102 100%)',
          }}
        >
          <p className="text-eyebrow" style={{ color: '#f7f8f8', opacity: 0.8 }}>
            DISCOVERY REPORT
          </p>
          <h2 className="text-headline" style={{ color: '#ffffff' }}>
            便携音频工作站 · 发现报告
          </h2>
        </div>
        <div className="space-y-4 p-6">
          <p>
            产品发现的核心循环是「提出假设—评估风险—设计实验—构建机会树—形成报告」。本样张将中文字体渲染、渐变背景、细边框表格与矢量图形压入同一次
            html-to-image 光栅化流程，用于验证中文环境下的 PNG 导出保真度。
          </p>
          <table className="w-full border-collapse text-body-sm">
            <thead>
              <tr>
                <th className="border border-reading-border bg-reading-paper px-3 py-2 text-left">
                  假设类别
                </th>
                <th className="border border-reading-border bg-reading-paper px-3 py-2 text-left">
                  影响
                </th>
                <th className="border border-reading-border bg-reading-paper px-3 py-2 text-left">
                  风险
                </th>
                <th className="border border-reading-border bg-reading-paper px-3 py-2 text-left">
                  优先分
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-reading-border px-3 py-2">价值假设</td>
                <td className="border border-reading-border px-3 py-2">5</td>
                <td className="border border-reading-border px-3 py-2">4</td>
                <td className="border border-reading-border px-3 py-2">16.25</td>
              </tr>
              <tr>
                <td className="border border-reading-border px-3 py-2">可行性假设</td>
                <td className="border border-reading-border px-3 py-2">3</td>
                <td className="border border-reading-border px-3 py-2">5</td>
                <td className="border border-reading-border px-3 py-2">11.25</td>
              </tr>
              <tr>
                <td className="border border-reading-border px-3 py-2">可存续性假设</td>
                <td className="border border-reading-border px-3 py-2">2</td>
                <td className="border border-reading-border px-3 py-2">3</td>
                <td className="border border-reading-border px-3 py-2">4.50</td>
              </tr>
            </tbody>
          </table>
          <svg viewBox="0 0 320 90" className="w-full" role="img" aria-label="优先级分布示意">
            <rect x="10" y="46" width="40" height="40" fill="#5e6ad2" rx="3" />
            <rect x="70" y="30" width="40" height="56" fill="#828fff" rx="3" />
            <rect x="130" y="56" width="40" height="30" fill="#7a7fad" rx="3" />
            <rect x="190" y="18" width="40" height="68" fill="#5e69d1" rx="3" />
            <rect x="250" y="62" width="40" height="24" fill="#34343a" rx="3" />
            <line x1="0" y1="86" x2="320" y2="86" stroke="#e9e7e4" strokeWidth="1" />
          </svg>
          <p className="text-caption" style={{ color: '#787774' }}>
            图 1 — 假设优先级分布示意（SVG 矢量，光栅化后检查锯齿与色彩偏移）。
          </p>
        </div>
      </div>
    </main>
  )
}
