import { describe, expect, it } from 'vitest'
import {
  PROJECT_SECTIONS,
  SECTION_LABELS,
  SETTINGS_PATHS,
  projectPath,
  resolveSection,
} from '@/app/nav'

describe('resolveSection — §3.1 section 回退', () => {
  it('keeps every valid section', () => {
    for (const s of PROJECT_SECTIONS) {
      expect(resolveSection(s)).toBe(s)
    }
  })

  it('falls back to overview for unknown / undefined sections', () => {
    expect(resolveSection('bogus')).toBe('overview')
    expect(resolveSection(undefined)).toBe('overview')
    expect(resolveSection('')).toBe('overview')
  })
})

describe('route contract', () => {
  it('builds /project/:projectId/<section> paths', () => {
    expect(projectPath('p1')).toBe('/project/p1/overview')
    expect(projectPath('p1', 'ost')).toBe('/project/p1/ost')
  })

  it('labels cover exactly the five sections', () => {
    expect(Object.keys(SECTION_LABELS).sort()).toEqual([...PROJECT_SECTIONS].sort())
  })

  it('settings paths stay flat and shareable', () => {
    expect(SETTINGS_PATHS.aiProvider).toBe('/settings/ai-provider')
    expect(SETTINGS_PATHS.dataBackup).toBe('/settings/data-backup')
    expect(SETTINGS_PATHS.privacy).toBe('/settings/privacy')
    expect(SETTINGS_PATHS.about).toBe('/settings/about')
  })
})
