import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Waits until the app is actually interactive. `goto` resolves before the module
 * graph has run: filling a controlled input during that window is silently undone
 * by the first React render (the field comes back empty and the submit button stays
 * disabled). The splash is removed 1.25s after mount, which makes it a reliable
 * "React is alive" signal.
 */
export async function bootApp(page: Page): Promise<void> {
  await page.goto('/')
  await page.waitForFunction(() => document.getElementById('dc-splash') === null, undefined, {
    timeout: 15_000,
  })
  const skip = page.getByRole('button', { name: '跳过指引' })
  if (await skip.count()) {
    await skip.click()
    await page.waitForTimeout(250)
  }
  // Any surviving modal would swallow clicks; Esc is the documented close path.
  if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape')
}

/** Fills a controlled input, verifying the value survives React's re-render. */
export async function fillStable(locator: Locator, value: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await locator.fill(value)
    if ((await locator.inputValue()) === value) return
    await locator.page().waitForTimeout(150)
  }
  await expect(locator).toHaveValue(value)
}

/** Creates a project through the dashboard form and returns its URL. */
export async function createProject(page: Page, name: string): Promise<string> {
  await bootApp(page)
  await fillStable(page.locator('#new-project-name'), name)
  const submit = page.locator('form button[type="submit"]')
  await expect(submit).toBeEnabled()
  await submit.click()
  await page.waitForURL(/project/, { timeout: 15_000 })
  await page.waitForTimeout(500)
  return page.url()
}
