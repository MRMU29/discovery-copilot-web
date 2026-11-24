import { expect, test } from '@playwright/test'
import { bootApp, createProject } from './helpers'

test('creates a project and lands on its overview', async ({ page }) => {
  const url = await createProject(page, '烟测项目')
  expect(url).toMatch(/\/project\/[^/]+\/overview$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('烟测项目')
})

test('records an assumption through the dialog', async ({ page }) => {
  const projectUrl = await createProject(page, '烟测-假设')
  await page.goto(projectUrl.replace(/overview\/?$/, 'assumptions'))
  await page.waitForTimeout(600)

  await page.getByRole('button', { name: /录入假设|新增|添加/ }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  // The dialog must be in the viewport, not at the bottom of the document
  // (regression guard for the animation/containing-block bug).
  const box = await dialog.boundingBox()
  expect(box!.y).toBeLessThan(page.viewportSize()!.height)

  const statement = '若提供一键导入模板，则新用户首次导入时间缩短一半'
  await dialog.getByRole('textbox').first().fill(statement)
  await dialog.getByRole('button', { name: /添加假设|保存|添加/ }).last().click()
  await page.waitForTimeout(500)
  await expect(page.getByText(statement)).toBeVisible()
})

test('exports a .dcopilot backup and never includes the API key', async ({ page }) => {
  await createProject(page, '烟测-导出')
  await bootApp(page)
  await page.goto('/settings/data-backup')
  await page.waitForTimeout(600)

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20_000 }),
    page.getByRole('button', { name: '导出全部项目' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/\.dcopilot$/)
})

test('renames a project and archives it reversibly', async ({ page }) => {
  await createProject(page, '烟测-整理')
  await bootApp(page)

  await page.getByRole('button', { name: /^重命名项目「烟测-整理」/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('textbox').fill('烟测-整理-改')
  await dialog.getByRole('button', { name: '保存' }).click()
  await expect(page.getByRole('link', { name: /烟测-整理-改/ })).toBeVisible()

  await page.getByRole('button', { name: /^归档项目「烟测-整理-改」/ }).click()
  // The card leaves the main grid but stays in the archived section.
  await expect(page.getByRole('button', { name: /^归档项目/ })).toHaveCount(0)
  await page.getByText('已归档（1）').click()
  await page.getByRole('button', { name: /^取消归档「烟测-整理-改」/ }).click()
  await expect(page.getByText(/^已归档（/)).toHaveCount(0)
  await expect(page.getByRole('link', { name: /烟测-整理-改/ })).toBeVisible()
})
