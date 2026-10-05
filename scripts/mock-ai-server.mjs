#!/usr/bin/env node
/**
 * Local mock OpenAI-compatible AI server — browser E2E helper for command 5
 * acceptance (AI 假设识别全流程 without a real key). Not part of the app bundle.
 *
 *   node scripts/mock-ai-server.mjs   # listens on http://127.0.0.1:8787/v1
 *
 * Endpoints:
 *   GET  /v1/models           → 200 (used by 测试连接)
 *   POST /v1/chat/completions → body-keyword routed payload:
 *       「八个风险类别」(identify-assumptions) → 8 assumptions
 *       「验证实验」(design-experiments)       → 3 experiments
 *       「发现报告」(generate-report)          → markdown report draft (fenced)
 */
import { createServer } from 'node:http'

const PORT = 8787

const payload = {
  assumptions: [
    {
      statement: '中小企业主愿意为自动对账功能支付每月 30 元订阅费',
      type: 'value',
      rationale: '付费意愿未经验证，直接决定收入模型是否成立',
      suggestedImpact: 5,
      suggestedRisk: 4,
    },
    {
      statement: '财务人员能在 5 分钟内不依赖文档完成首次银行流水导入',
      type: 'usability',
      rationale: '若导入失败率高，首日留存将崩塌',
      suggestedImpact: 4,
      suggestedRisk: 4,
    },
    {
      statement: '浏览器本地索引可以在 10 万行流水下保持 1 秒内筛选响应',
      type: 'feasibility',
      rationale: '性能上限未知，影响核心体验承诺',
      suggestedImpact: 4,
      suggestedRisk: 3,
    },
    {
      statement: '目标客户现有记账工具的数据导出格式可被稳定解析',
      type: 'feasibility',
      rationale: '第三方格式不受我方控制',
      suggestedImpact: 3,
      suggestedRisk: 3,
    },
    {
      statement: '用户信任浏览器本地存储并愿意长期存放财务数据',
      type: 'strategy',
      rationale: '本地优先路线若与信任预期冲突，需改为云存储架构',
      suggestedImpact: 5,
      suggestedRisk: 3,
    },
    {
      statement: '无独立销售团队时，SEO 内容能带来每月 500 以上自然注册',
      type: 'go-to-market',
      rationale: '冷启动获客渠道未经验证',
      suggestedImpact: 3,
      suggestedRisk: 4,
    },
    {
      statement: '两人兼职团队可以在三个月内交付对账 MVP',
      type: 'team',
      rationale: '投入时间与技能覆盖决定交付节奏',
      suggestedImpact: 2,
      suggestedRisk: 3,
    },
    {
      statement: '处理银行流水不需要金融牌照或额外合规审计',
      type: 'legal',
      rationale: '监管边界判断错误会直接叫停产品',
      suggestedImpact: 2,
      suggestedRisk: 5,
    },
  ],
}

// design-experiments (命令 6): 3 条覆盖不同成本档位，hypothesis 含数字阈值。
const experimentsPayload = {
  experiments: [
    {
      hypothesis: '若在引导页放置「一键导入流水」假门入口，则 25% 以上的新用户会在 7 天内点击',
      method: '假门测试：引导页放置入口按钮，统计 7 天内展示与点击，点击后显示「即将上线」并收集邮箱',
      successCriteria: '7 天内入口点击率 ≥ 25%，收集邮箱 ≥ 100 个',
    },
    {
      hypothesis: '若由人工在 24 小时内交付首次对账结果，则 10 家试用用户中至少 6 家愿意为第二次付费',
      method: 'Wizard of Oz：招募 10 家目标小企业，人工模拟自动对账服务交付结果，观察实际付款行为',
      successCriteria: '10 家中 ≥ 6 家完成付费转化',
    },
    {
      hypothesis: '浏览器端解析 10 万行银行流水的耗时可以控制在 3 秒以内',
      method: '技术尖刺：用 3 天构建解析原型，分别测 1 万 / 5 万 / 10 万行数据的解析耗时与内存占用',
      successCriteria: '10 万行解析耗时 ≤ 3 秒，内存峰值 ≤ 500MB',
    },
  ],
}

// generate-report (命令 9): Markdown 报告草稿，fence 包裹以顺带验证容错解析链。
const reportPayload = {
  title: '自动对账助手 · 发现报告',
  sections: ['背景', '假设优先级', '实验计划', '结论与下一步'],
  content: [
    '## 背景',
    '面向中小企业主的自动对账助手：自动导入银行流水、分类支出、生成对账结果，解决「人工对账耗时易错」的问题。',
    '',
    '## 假设优先级',
    '- 最高优先分：付费意愿（价值，20.0）——直接决定收入模型，当前零证据。',
    '- 上手可用性（可用性，16.0）与本地索引性能（可行性，12.0）紧随其后。',
    '- 法律合规（风险 5）优先分不高，但一旦判断错误即叫停，保持关注。',
    '',
    '## 实验计划',
    '1. 假门测试（待执行）：7 天入口点击率 ≥ 25% 即验证付费意向。',
    '2. Wizard of Oz（待执行）：10 家试用用户中 ≥ 6 家完成付费转化。',
    '3. 技术尖刺（待执行）：10 万行解析耗时 ≤ 3 秒。',
    '',
    '## 结论与下一步',
    '付费意愿假设仍是最大缺口：优先执行假门测试，同步启动 Wizard of Oz 招募；技术尖刺可并行推进以降低可行性风险。',
  ].join('\n'),
}

function pickPayload(raw) {
  // 注意顺序：报告 prompt 也含「验证实验」字样，必须先判报告。
  if (raw.includes('发现报告') || raw.includes('项目发现数据')) return reportPayload
  if (raw.includes('验证实验')) return experimentsPayload
  return payload
}

const server = createServer((req, res) => {
  // Browser E2E runs on a different port — answer the CORS preflight.
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`)
  if (req.method === 'GET' && url.pathname === '/v1/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ data: [{ id: 'mock-model' }] }))
    return
  }
  if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
    })
    req.on('end', () => {
      const payload = pickPayload(raw)
      // 报告回复用围栏 + 前导解释文字包裹，顺带覆盖容错解析链（剥 fence / 取首末花括号）。
      const content =
        payload === reportPayload
          ? `好的，这是基于项目数据整理的发现报告草稿：\n\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``
          : JSON.stringify(payload)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          choices: [{ message: { content } }],
          usage: { prompt_tokens: 320, completion_tokens: 580 },
        }),
      )
    })
    return
  }
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: { message: `mock-ai-server: no route for ${req.method} ${url.pathname}` } }))
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock-ai-server] listening on http://127.0.0.1:${PORT}/v1`)
})
