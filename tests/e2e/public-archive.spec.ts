import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

/**
 * Accessibility and behaviour of the public archive, on desktop and on a
 * phone. The axe scan is a floor, not a certificate: it catches contrast,
 * labelling, and structure problems, and the manual checks in
 * docs/ACCESSIBILITY.md cover what automation cannot.
 */
test.describe('public meeting archive', () => {
  test('has no detectable accessibility violations', async ({ page }) => {
    await page.goto('/meetings')
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze()
    expect(results.violations).toEqual([])
  })

  test('is reachable and operable by keyboard alone', async ({ page }) => {
    await page.goto('/meetings')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: /skip to main content/i })).toBeFocused()

    await page.getByLabel('Search meetings').fill('council')
    await page.getByRole('button', { name: 'Apply filters' }).click()
    await expect(page).toHaveURL(/q=council/)
  })

  test('separates upcoming from past meetings', async ({ page }) => {
    await page.goto('/meetings')
    await expect(page.getByRole('heading', { name: 'Upcoming meetings' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Past meetings' })).toBeVisible()
  })

  test('does not scroll horizontally on a phone', async ({ page }) => {
    await page.goto('/meetings')
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    )
    expect(overflow).toBe(false)
  })

  test('stays usable at 200% zoom', async ({ page }) => {
    await page.goto('/meetings')
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%'
    })
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    )
    expect(overflow).toBe(false)
  })

  test('keeps the administration area behind a sign-in', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/sign-in/)
  })
})
