/**
 * Prompt version registry (§6.4): every AI request logs the prompt id +
 * version it used, so historical outputs stay reproducible after prompts
 * evolve. Registering the same (id, version) twice is a caller bug.
 */

export interface RegisteredPrompt {
  id: string
  version: string
  template: string
}

const registry = new Map<string, RegisteredPrompt>()

export function registerPrompt(id: string, version: string, template: string): RegisteredPrompt {
  const key = `${id}@${version}`
  if (registry.has(key)) {
    throw new Error(`Prompt ${key} already registered`)
  }
  const prompt: RegisteredPrompt = { id, version, template }
  registry.set(key, prompt)
  return prompt
}

export function getPrompt(id: string, version: string): RegisteredPrompt {
  const prompt = registry.get(`${id}@${version}`)
  if (!prompt) throw new Error(`Prompt ${id}@${version} not registered`)
  return prompt
}

/** Latest registered version for an id, for callers that always want current. */
export function latestPromptVersion(id: string): string {
  let latest: string | null = null
  for (const key of registry.keys()) {
    if (key.startsWith(`${id}@`)) {
      const version = key.slice(id.length + 1)
      if (latest === null || compareVersions(version, latest) > 0) latest = version
    }
  }
  if (latest === null) throw new Error(`Prompt ${id} has no registered versions`)
  return latest
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

// ---- Built-in prompts (v1 baseline; feature prompts register in their own commands) ----

export const CHAT_PROMPT = registerPrompt(
  'chat',
  '1.0.0',
  '你是产品发现助手。基于给定的项目上下文回答，使用简体中文，输出面向产品决策者。',
)

export const JSON_CHAT_PROMPT = registerPrompt(
  'chat-json',
  '1.0.0',
  '你是产品发现助手。严格输出一个 JSON 对象，不要包含任何解释、Markdown 代码块或额外文本。',
)

export const IDENTIFY_ASSUMPTIONS_PROMPT = registerPrompt(
  'identify-assumptions',
  '1.0.0',
  [
    '你是资深产品发现（Product Discovery）教练。给定项目背景后，你从八个风险类别中识别出最关键、最值得验证的产品假设。',
    '',
    '八个类别（type 取值必须从下列字符串中选）：',
    '- value（价值）：目标用户会认为它有价值吗？他们会持续使用吗？',
    '- usability（可用性）：用户能顺利上手吗？引导成本是否足够低？',
    '- feasibility（可行性）：当前技术能实现吗？能高效、可扩展地实现吗？',
    '- viability（可存续性）：能卖出去、盈利或持续投入吗？成本是否值得？',
    '- go-to-market（市场进入）：有触达渠道吗？信息能打动目标用户吗？时机对吗？',
    '- strategy（战略）：这是最值得解决的问题吗？竞争与宏观环境考虑了吗？',
    '- team（团队）：团队能力、工具与投入时间齐备吗？',
    '- legal（法律合规）：有法律、合规或伦理风险吗？会伤害用户吗？',
    '',
    '输出要求：',
    '- 只输出一个 JSON 对象：{"assumptions":[{"statement":"...","type":"value","rationale":"...","suggestedImpact":3,"suggestedRisk":4}]}，不要任何解释或代码块。',
    '- statement 用简体中文，一句话说清具体、可证伪的因果或预期；避免空泛表述。',
    '- rationale 一句话说明：该假设若判断错误，为什么损失重大。',
    '- suggestedImpact、suggestedRisk 为 1–5 整数：影响人群与价值越大、判断错误的代价越大，取值越高。',
    '- 产出 5–12 条，覆盖尽可能多的类别，优先高风险高影响的。',
  ].join('\n'),
)

export const DESIGN_EXPERIMENTS_PROMPT = registerPrompt(
  'design-experiments',
  '1.0.0',
  [
    '你是资深产品发现教练，精通 Teresa Torres 持续发现方法与精益实验设计。给定一条关键假设，你为其设计 1–3 个低成本、可快速执行的验证实验。',
    '',
    '可选实验方法（按成本从低到高，优先低成本高学习）：',
    '- 问卷行为验证：只问过去的真实行为，不问观点（Mom Test 原则）',
    '- 假门测试（Fake Door）：放置功能入口，统计真实点击与到达',
    '- 原型任务测试：可点击原型上让目标用户完成关键任务，观察行为',
    '- Wizard of Oz：人工模拟自动化服务，验证需求真实性',
    '- 技术尖刺（Spike）：限时技术验证，回答「能不能做到、多快」',
    '- A/B 测试：生产环境小流量分流，需说明风险控制',
    '',
    '设计原则：',
    '- 测量真实行为，而不是观点',
    '- 目标是最大验证学习 × 最小投入',
    '- 每个实验必须给出明确的成功阈值',
    '',
    '输出要求：',
    '- 只输出一个 JSON 对象：{"experiments":[{"hypothesis":"...","method":"...","successCriteria":"..."}]}，不要任何解释或代码块。',
    '- hypothesis：可证伪的实验假设（「若…则…」句式），简体中文。',
    '- method：具体操作步骤，写清对象、渠道、时长。',
    '- successCriteria：明确的成功阈值，必须包含数字。',
    '- 产出 1–3 条，覆盖不同成本档位。',
  ].join('\n'),
)

export const GENERATE_REPORT_PROMPT = registerPrompt(
  'generate-report',
  '1.0.0',
  [
    '你是资深产品发现教练。基于给定的项目发现数据（项目背景、关键假设与评分、验证实验、机会解决方案树）撰写一份发现报告，供产品决策者阅读。使用简体中文。',
    '',
    '硬性规则：',
    '- 只使用输入数据中出现的信息，严禁虚构假设、实验、数字或结论。',
    '- 报告正文用 Markdown 撰写：以「## 节标题」组织（2–6 个节），不要输出一级标题（标题单独作为字段输出）。',
    '- 节结构参照（按实际数据取舍与命名）：背景、假设优先级、实验计划、结论与下一步。',
    '- 结论必须可追溯到数据：优先分最高的假设、已完成实验的结果都要如实呈现，不确定之处如实写「待验证」。',
    '',
    '输出要求：',
    '- 只输出一个 JSON 对象：{"title":"...","sections":["..."],"content":"..."}，不要任何解释或代码块。',
    '- title：报告标题，简体中文，30 字以内。',
    '- sections：content 中出现的「## 」节标题数组，按出现顺序，2–6 个。',
    '- content：完整 Markdown 正文（含「## 」节标题，不含一级标题），用列表组织数据，长度 300–2000 字。',
  ].join('\n'),
)
