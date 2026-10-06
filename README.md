[English](./README.en.md) | 简体中文

# Discovery Copilot (Web)

无需账号、本地优先（IndexedDB）、BYOK、以 `.dcopilot` 文件跨设备迁移的产品发现工作台。  
线上地址：<https://discovery-copilot-web.pages.dev>

## 功能一览

- **项目管理**：创建 / 编辑 / 删除（回收站保留 30 天）/ 示例项目一键加载
- **关键假设**：八类风险假设、Impact × Risk × (1 − Confidence) 优先级、Recharts 优先级矩阵（含表格等价视图）
- **实验计划**：从假设生成 → 审核 → 保存 → 状态与结果回填
- **机会解决方案树（OST）**：拖拽 + 双指缩放 + 键盘等价操作 + 表格等价视图 + 视口裁剪
- **AI Copilot**：BYOK 直连（OpenAI 兼容 / Gemini）与 Prompt Relay（零配置复制粘贴）双路径；识别 / 实验 / 报告三类任务；审核式工作流（预览 / 应用 / 拒绝 / 重新生成 / 取消）
- **成本保护**：请求前 Token/费用预估、预算熔断（单次 + 月度）、按日用量视图
- **发现报告**：AI 生成 + 手动撰写，区分 AI 生成与用户确认内容；HTML（保真推荐）/ PNG（尽力而为）导出
- **备份迁移**：`.dcopilot` 导出（全部 / 单项目）、导入（六类场景校验、冲突三选、失败回滚）、覆盖前自动快照（保留 3 份）
- **外观与语言**：浅色 / 深色 / 跟随系统三档主题（首帧无闪烁）、启动页动画、8 种界面语言（简中 / 繁中 / 英 / 日 / 韩 / 俄 / 德 / 法，随 `.dcopilot` 迁移）
- **隐私与可观测性**：数据本地存储、诊断包脱敏导出

## 技术栈

React 18 + TypeScript + Vite · Tailwind CSS 4（设计令牌单一来源 `src/styles/tokens.css`）· Dexie + IndexedDB · React Router · Zustand（仅 UI 状态）· dnd-kit · Recharts · Zod · marked + DOMPurify · html-to-image · Vitest + fake-indexeddb

## 开发

```bash
pnpm install
pnpm dev              # 开发服务器（--host 后可用手机直连）
pnpm build            # 类型检查 + 产物构建
pnpm test             # Vitest 全量（含 20MB 导入压测探针）
pnpm test:coverage    # 覆盖率门槛（schemas/db/ai 行覆盖 ≥ 80%）
pnpm lint && pnpm typecheck
pnpm preview          # 生产构建本地预览
pnpm probe:provider-cors   # Provider 浏览器直连 CORS 矩阵（无 Key）
```

- 令牌预览页：`/dev/tokens`；PNG 导出保真探针：`/dev/export-probe`（仅 dev 模式）

## 开发方式

本项目由一名人类负责人（需求、架构裁决、验收）与 AI Agent 编排协作完成：

| 角色                                    | 承担                       |
| ------------------------------------- | ------------------------ |
| MRMU29                                | 产品决策、架构裁决、逐命令验收          |
| GLM-5.3-Flash（ZCode）                  | 命令式开发编码实现与部署             |
| DeepSeek V4.1-Flash（DeepSeek Harness） | 代码审查与测试                  |
| GPT-5.6-Luna（Codex）                   | 项目计划统筹                   |

协作方式为「命令式开发」：人类逐条下达命令，AI 完成后按五段（文件树/关键代码/运行调试/验收结果/待确认问题）汇报并等待下一条。

## 开源素材来源

- 应用图标与品牌图：项目自有素材（`public/brand-icon.jpg`）
- 界面图标：自绘内联 SVG（`src/components/ui/icons.tsx`），未使用第三方图标库素材
- 全部运行时依赖为开源库，清单与版本以 `package.json` / `pnpm-lock.yaml` 为准

## 部署

构建产物为纯静态文件（`pnpm build` → `dist/`），任意静态托管均可。本仓库部署于 **Cloudflare Pages**（连接 GitHub 仓库，推送 `main` 自动构建）：

1. Cloudflare 控制台 → Workers & Pages → Create → Pages → 连接 `MRMU29/discovery-copilot-web`
2. 构建命令 `pnpm build`，输出目录 `dist`
3. 环境变量建议设 `NODE_VERSION=24`、`PNPM_VERSION=12.6`（Cloudflare 构建机默认版本可能偏旧）
4. `public/_redirects`（SPA 深链 fallback）与 `public/_headers`（CSP 等安全响应头）随构建自动生效

<details>
<summary>自托管（nginx 示例）</summary>

```nginx
location / {
  try_files $uri $uri/ /index.html;   # SPA fallback
  add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src *; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
```

</details>

### 关于 CSP 的说明

`script-src 'self'` 是防注入核心；`connect-src *` 是**有意放开**——BYOK 用户自行配置 AI Provider 的 Base URL（任意域名），应用无法预知白名单。应用自身不加载任何第三方脚本。

## 安全模型

- **API Key 仅保存在当前会话内存**（页面关闭即消失）：从不写入 IndexedDB 或 localStorage、不随 `.dcopilot` 导出、不出现在 URL 与日志；应用不提供"记住 Key"。新设备导入备份后需重新配置 Key。
- 备份文件（`.dcopilot`）与诊断包均不含 Secret；诊断包只含脱敏元数据（版本、浏览器环境、存储概况、最近 50 条 AI 请求元数据），导出前可预览全部内容。
- AI 输出（含报告 Markdown）在应用内渲染与导出文件中均经 DOMPurify 消毒（限协议、防 XSS）。
- 应用内含完整的《隐私政策》与《用户协议》（含免责声明），见「设置 → 关于 → 产品与文档」。

## 隐私与数据留存

- 项目数据默认只保存在当前浏览器（IndexedDB）；清除站点数据或卸载浏览器 = 数据不可恢复，建议先导出备份。
- 调用 AI 时，相关输入会发送至**你配置的** AI 服务，处理方式取决于该服务的隐私政策；Prompt Relay 模式下内容由你自己交给外部 AI，不经过本应用任何服务器。
- 应用无账号、无遥测、无服务端、无 Cookie 追踪；静态页面由托管平台分发。
- 「设置 → 关于 → 初始化应用」可删除全部本地数据并归还存储空间。

## 发布前安全检查

发布或贡献前运行：

```bash
pnpm security:check
```

脚本（`scripts/security-check.mjs`）检查三项并任一命中即失败退出：

1. `git ls-files` 中不得出现敏感路径（`.env*`、`*.pem`、`*.key`、`*.dcopilot` 等）
2. 全部文本源码不得包含真实密钥形态（OpenAI/GitHub/AWS/Google/Anthropic Key 的长度校验模式）
3. 发布仓库中不得混入内部文档（AGENTS/HANDOFF/验收记录等）

本地构建前还有一道 `scripts/prepare-release.mjs`：重建发布目录时自动校验发布树零内部材料、零用户数据、零密钥形态，任一命中即中止。

GitHub 仓库端同步开启：Secret Scanning、Push Protection、Dependabot alerts 与 `.github/dependabot.yml`（npm / GitHub Actions 周检）。`.env.example` 仅为命名约定示例——应用运行时不需要环境变量。

## 浏览器兼容基线

- **P0**：Windows Chrome / Edge 最新两个大版本；Android Chrome 最新版
- **尽力支持**：Safari 16+、iOS Safari 16+、Firefox 最新两个大版本
- **已知差异**：iOS Safari 存储配额更紧、后台标签页可能被回收中断长事务、大文件导入内存峰值偏高

## 已知限制

1. 评分审计轨迹（score_events）不随 `.dcopilot` 迁移（文件格式 §7.2 无此键）；假设的当前评分完整迁移。
2. PNG 报告导出为尽力而为路径（html-to-image 在复杂渐变/特殊字体下可能有偏差）——**保真分享请用 HTML 导出**。
3. API Key 会话内存策略意味着每次刷新 / 重开浏览器需重新输入（可在设置页「保存到本会话」）。
4. 容量边界（§5.4）：本地 ≤ 50 项目、单项目 ≤ 200 假设 / 300 OST 节点 / 100 实验 / 20 报告；单次导入文件 ≤ 20 MB。
5. BYOK 浏览器直连依赖 Provider 的 CORS 策略——不支持直连的服务请配置兼容代理（`pnpm probe:provider-cors` 可无 Key 探测）。
6. 无自动同步：**本地数据即唯一副本**，请定期导出 `.dcopilot` 备份（删除项目 30 天内可从回收站恢复）。

## 测试

单元 + 集成共 229 例（Vitest，fake-indexeddb 覆盖 IndexedDB 事务与迁移），导入「合法 / 非法 / 损坏 / 旧版本 / 冲突 / 回滚」六类场景均有专测；覆盖率门槛 schemas/db/ai 行覆盖 ≥ 80%。

## 许可

[MIT](./LICENSE)
