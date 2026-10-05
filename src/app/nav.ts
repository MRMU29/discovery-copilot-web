/** §3.1 route contract: /project/:projectId/<section>, flat child routes, ≤3 segments. */

export const PROJECT_SECTIONS = ['overview', 'assumptions', 'experiments', 'ost', 'report'] as const

export type ProjectSection = (typeof PROJECT_SECTIONS)[number]

export const SECTION_LABELS: Record<ProjectSection, string> = {
  overview: '概览',
  assumptions: '假设',
  experiments: '实验',
  ost: 'OST',
  report: '报告',
}

/**
 * §3.1: 项目切换时保持当前 section；section 不存在时回退到 overview。
 * 渲染在原 URL 上进行（不产生额外历史记录）。
 */
export function resolveSection(raw: string | undefined): ProjectSection {
  return (PROJECT_SECTIONS as readonly string[]).includes(raw ?? '') ? (raw as ProjectSection) : 'overview'
}

export function projectPath(projectId: string, section: ProjectSection = 'overview'): string {
  return `/project/${projectId}/${section}`
}

export const SETTINGS_PATHS = {
  aiProvider: '/settings/ai-provider',
  dataBackup: '/settings/data-backup',
  privacy: '/settings/privacy',
  about: '/settings/about',
} as const

export const SETTINGS_LABELS: Record<keyof typeof SETTINGS_PATHS, string> = {
  aiProvider: 'AI Provider',
  dataBackup: '数据与备份',
  privacy: '隐私',
  about: '关于',
}
