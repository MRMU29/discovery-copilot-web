/** §3.1 route contract: /project/:projectId/<section>, flat child routes, ≤3 segments. */

export const PROJECT_SECTIONS = ['overview', 'assumptions', 'experiments', 'ost', 'report'] as const

export type ProjectSection = (typeof PROJECT_SECTIONS)[number]

/** 字典键（src/lib/i18n dictionaries）——渲染处经 t() 取本地化文案。 */
export const SECTION_LABELS: Record<ProjectSection, string> = {
  overview: 'nav.section.overview',
  assumptions: 'nav.section.assumptions',
  experiments: 'nav.section.experiments',
  ost: 'nav.section.ost',
  report: 'nav.section.report',
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
  appearance: '/settings/appearance',
  dataBackup: '/settings/data-backup',
  privacy: '/settings/privacy',
  about: '/settings/about',
} as const

export type SettingsSectionKey = keyof typeof SETTINGS_PATHS

/** 侧栏分区（隐私政策从「关于 → 产品与文档」进入，不进侧栏）。 */
export const SETTINGS_NAV = ['aiProvider', 'appearance', 'dataBackup', 'about'] as const satisfies readonly SettingsSectionKey[]

export const SETTINGS_LABELS: Record<SettingsSectionKey, string> = {
  aiProvider: 'nav.section.aiProvider',
  appearance: 'nav.section.appearance',
  dataBackup: 'nav.section.dataBackup',
  privacy: 'nav.section.privacy',
  about: 'nav.section.about',
}
