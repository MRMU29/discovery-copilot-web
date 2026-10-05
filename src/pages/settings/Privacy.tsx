export default function Privacy() {
  return (
    <div className="space-y-4">
      <h2 className="text-headline text-ink">隐私</h2>
      <div className="rounded-lg border border-hairline bg-surface-1 p-6">
        <ul className="list-disc space-y-3 pl-5 text-body text-ink-secondary">
          <li>项目数据默认保存在当前浏览器的 IndexedDB 中，不经过任何服务器。</li>
          <li>调用 AI 时，相关输入会发送至你所配置的 AI 服务，处理方式取决于该服务的隐私政策。</li>
          <li>
            API Key 仅保存在当前会话内存中；除非你主动开启「记住 Key」，关闭页面即消失。Key
            不会写入项目数据、备份文件、URL 或日志。
          </li>
          <li>
            清除站点数据或卸载浏览器将导致本地项目不可恢复删除——请通过「数据与备份」定期导出
            .dcopilot 文件。
          </li>
        </ul>
      </div>
    </div>
  )
}
