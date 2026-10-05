import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { assumptionsRepo, experimentsRepo, ostRepo, reportsRepo } from '@/db/repositories'
import { EmptyState, PageSkeleton } from '@/components/common/states'
import { projectPath } from '@/app/nav'

export default function Overview({ projectId }: { projectId: string }) {
  const counts = useLiveQuery(
    async () => ({
      assumptions: await assumptionsRepo.countByProject(projectId),
      experiments: await experimentsRepo.countByProject(projectId),
      ost: await ostRepo.countByProject(projectId),
      reports: await reportsRepo.countByProject(projectId),
    }),
    [projectId],
  )

  if (counts === undefined) return <PageSkeleton />

  const stats = [
    { label: '关键假设', value: counts.assumptions, href: projectPath(projectId, 'assumptions') },
    { label: '验证实验', value: counts.experiments, href: projectPath(projectId, 'experiments') },
    { label: 'OST 节点', value: counts.ost, href: projectPath(projectId, 'ost') },
    { label: '发现报告', value: counts.reports, href: projectPath(projectId, 'report') },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            to={s.href}
            className="rounded-lg border border-hairline bg-surface-1 p-4 transition-colors hover:border-hairline-strong"
          >
            <p className="text-caption text-ink-muted">{s.label}</p>
            <p className="mt-1 text-display-md text-ink">{s.value}</p>
          </Link>
        ))}
      </div>

      {counts.assumptions === 0 ? (
        <EmptyState
          title="从假设开始"
          description="先录入产品想法的关键假设，再做优先级评估与实验设计。"
          action={
            <Link
              to={projectPath(projectId, 'assumptions')}
              className="inline-flex min-h-11 items-center rounded-btn bg-accent px-4 py-2.5 text-button text-white"
            >
              去录入假设
            </Link>
          }
        />
      ) : counts.experiments === 0 ? (
        <EmptyState
          title="下一步：设计实验"
          description="假设已经就位——为高优先级假设设计低成本验证实验，或构建 OST 梳理逻辑。"
          action={
            <Link
              to={projectPath(projectId, 'experiments')}
              className="inline-flex min-h-11 items-center rounded-btn bg-accent px-4 py-2.5 text-button text-white"
            >
              去设计实验
            </Link>
          }
        />
      ) : counts.ost === 0 ? (
        <EmptyState
          title="下一步：构建 OST"
          description="实验计划已就位——用机会解决方案树梳理「结果 → 机会 → 方案 → 实验」的逻辑链。"
          action={
            <Link
              to={projectPath(projectId, 'ost')}
              className="inline-flex min-h-11 items-center rounded-btn bg-accent px-4 py-2.5 text-button text-white"
            >
              去构建 OST
            </Link>
          }
        />
      ) : (
        <EmptyState
          title="发现流程已走通"
          description="假设、实验与 OST 已就绪。继续验证实验并更新信心分；用 AI 或手动撰写发现报告；重要节点记得导出 .dcopilot 备份。"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link
                to={projectPath(projectId, 'report')}
                className="inline-flex min-h-11 items-center rounded-btn bg-accent px-4 py-2.5 text-button text-white"
              >
                生成发现报告
              </Link>
              <Link
                to={projectPath(projectId, 'experiments')}
                className="inline-flex min-h-11 items-center rounded-btn border border-hairline-strong bg-surface-2 px-4 py-2.5 text-button text-ink hover:bg-surface-3"
              >
                继续验证实验
              </Link>
            </div>
          }
        />
      )}
    </div>
  )
}
