const SURFACES = [
  { name: 'canvas', token: 'bg-canvas', label: '#f6fbfd 浅冷灰画布' },
  { name: 'surface-1', token: 'bg-surface-1', label: '#ffffff 白色卡片' },
  { name: 'surface-2', token: 'bg-surface-2', label: '#fafdff 浮层一级' },
  { name: 'surface-3', token: 'bg-surface-3', label: '#f6fbfd 浮层二级' },
  { name: 'surface-4', token: 'bg-surface-4', label: '#d3dee4 浮层三级' },
]

const INKS = [
  { name: 'ink', cls: 'text-ink', sample: '主文本 #222435 · 15.3:1' },
  { name: 'ink-secondary', cls: 'text-ink-secondary', sample: '次级 #35394c · 11.4:1' },
  { name: 'ink-muted', cls: 'text-ink-muted', sample: '弱化 #494e62 · 8.2:1' },
  { name: 'ink-faint', cls: 'text-ink-faint', sample: '极弱 #5c6479 · 5.9:1' },
]

const SEMANTIC = [
  { name: 'accent', cls: 'bg-accent', note: '#223f97 唯一强调色' },
  { name: 'accent-hover', cls: 'bg-accent-hover', note: 'hover #183087' },
  { name: 'accent-focus', cls: 'bg-accent-focus', note: 'focus #4b86cd' },
  { name: 'accent-soft', cls: 'bg-accent-soft', note: '选中底 #ebf7ff' },
  { name: 'success', cls: 'bg-success', note: '#18804e' },
  { name: 'warning', cls: 'bg-warning', note: '#ae600a' },
  { name: 'danger', cls: 'bg-danger', note: '#b2271f' },
]

const TINTS = [
  { name: 'tint-blue', cls: 'bg-tint-blue' },
  { name: 'tint-green', cls: 'bg-tint-green' },
  { name: 'tint-yellow', cls: 'bg-tint-yellow' },
  { name: 'tint-orange', cls: 'bg-tint-orange' },
  { name: 'tint-pink', cls: 'bg-tint-pink' },
  { name: 'tint-purple', cls: 'bg-tint-purple' },
]

const TYPE_SCALE = [
  { cls: 'text-display-md', label: 'display-md 40/700/-1.0px', sample: '发现驱动决策' },
  { cls: 'text-headline', label: 'headline 30/700/-0.6px', sample: '优先级矩阵' },
  { cls: 'text-card-title', label: 'card-title 22/600/-0.4px', sample: '假设识别引擎' },
  { cls: 'text-subhead', label: 'subhead 20/600/-0.2px', sample: '从模糊创意到可验证的实验计划' },
  { cls: 'text-body-lg', label: 'body-lg 18/400/-0.1px', sample: '本地优先的产品发现工作台' },
  { cls: 'text-body', label: 'body 16/400/1.6', sample: '项目数据默认保存在当前浏览器本地。' },
  { cls: 'text-body-sm', label: 'body-sm 14/400/1.55', sample: '卡片正文与页脚列。' },
  { cls: 'text-caption', label: 'caption 12/400/1.5', sample: '2026-10-03 · 状态元信息' },
  { cls: 'text-eyebrow', label: 'eyebrow 13/600/+0.6px', sample: 'DISCOVERY COPILOT' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-hairline bg-surface-1 p-6 shadow-card">
      <h2 className="text-eyebrow text-ink-muted">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

/**
 * Renders every token family from tokens.css so acceptance can eyeball the
 * design system in one screen. Pure display — no business logic.
 */
export function TokensPreview() {
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6 pb-16">
      <header>
        <p className="text-eyebrow text-accent">DISCOVERY COPILOT</p>
        <h1 className="text-display-md">设计令牌预览</h1>
        <p className="text-body text-ink-muted">
          明亮专业工作台：全部色阶由调色板算法生成，对比度矩阵 33/33 通过
          （正文 ≥ 4.5:1）。值经 src/styles/tokens.css 单一来源分发。
        </p>
      </header>

      <Section title="SURFACE LADDER — 浅画布到白卡片">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {SURFACES.map((s) => (
            <div key={s.name} className={`${s.token} rounded-lg border border-hairline p-4`}>
              <p className="text-body-sm">{s.name}</p>
              <p className="text-caption text-ink-muted">{s.label}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="INK — 四级文本色阶（全部达标）">
        <div className="space-y-2">
          {INKS.map((i) => (
            <p key={i.name} className={`text-body ${i.cls}`}>
              {i.sample}
            </p>
          ))}
        </div>
      </Section>

      <Section title="ACCENT & SEMANTIC — 靛蓝主色与语义状态">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {SEMANTIC.map((c) => (
            <div key={c.name} className="flex items-center gap-3">
              <span className={`${c.cls} h-8 w-8 rounded-md border border-hairline`} />
              <span className="text-body-sm text-ink-secondary">{c.note}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="HAIRLINE — 三级边框">
        <div className="space-y-3">
          <div className="rounded-lg border border-hairline p-3 text-body-sm">
            border-hairline #d3dee4 — 卡片与分隔线
          </div>
          <div className="rounded-lg border border-hairline-strong p-3 text-body-sm">
            border-hairline-strong #b1c0c8 — 输入聚焦环
          </div>
          <div className="rounded-lg border border-hairline-tertiary p-3 text-body-sm">
            border-hairline-tertiary #919eac — 嵌套表面
          </div>
        </div>
      </Section>

      <Section title="TYPE SCALE — 字阶">
        <div className="space-y-3">
          {TYPE_SCALE.map((t) => (
            <div key={t.cls}>
              <p className={`${t.cls} text-ink`}>{t.sample}</p>
              <p className="text-caption text-ink-faint">{t.label}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="RADIUS, ELEVATION & CONTROLS">
        <div className="flex flex-wrap items-center gap-4">
          <button className="rounded-btn bg-accent px-4 py-2 text-button text-white shadow-xs">
            主操作
          </button>
          <button className="rounded-btn border border-hairline bg-surface-1 px-4 py-2 text-button text-ink shadow-xs">
            次级操作
          </button>
          <span className="rounded-sm border border-hairline bg-surface-2 px-2 py-1 text-caption text-ink-muted">
            6px
          </span>
          <span className="rounded-md border border-hairline bg-surface-2 px-2 py-1 text-caption text-ink-muted">
            8px
          </span>
          <span className="rounded-btn border border-hairline bg-surface-2 px-2 py-1 text-caption text-ink-muted">
            10px
          </span>
          <span className="rounded-lg border border-hairline bg-surface-1 px-2 py-1 text-caption text-ink-muted shadow-card">
            14px
          </span>
        </div>
      </Section>

      <Section title="READING — 报告阅读面（纸张）">
        <div className="reading-surface rounded-lg border border-hairline p-6 shadow-card">
          <h3 className="text-card-title">发现报告示例</h3>
          <p className="mt-2 text-reading">
            本区域使用白纸阅读规范：白底、#222435 正文、16px/1.65 行高。报告、AI
            长文输出与分享内容在此渲染，与浅色应用外壳保持层级连贯。
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {TINTS.map((t) => (
              <span key={t.name} className={`${t.cls} h-6 rounded-sm`} />
            ))}
          </div>
          <p className="mt-2 text-caption text-reading-ink-secondary">
            上排：六种算法生成的分类底色（假设类别 / OST 节点类型）。
          </p>
        </div>
      </Section>
    </main>
  )
}
