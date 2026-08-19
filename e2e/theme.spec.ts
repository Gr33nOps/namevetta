import { expect, test } from '@playwright/test'

/**
 * The pre-paint theme script in `app/layout.tsx` is the one piece of raw DOM
 * code in the app, it runs before React exists, and no unit test can reach it.
 */
test.describe('theme', () => {
  test('an explicit choice survives a reload without a flash or a mismatch', async ({ page }) => {
    const problems: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') problems.push(msg.text())
    })
    page.on('pageerror', (err) => problems.push(err.message))

    await page.goto('/')
    await page.getByRole('button', { name: /Switch to (light|dark) mode/ }).click()

    const chosen = await page.locator('html').getAttribute('data-theme')
    expect(chosen === 'light' || chosen === 'dark').toBe(true)
    expect(await page.evaluate(() => localStorage.getItem('nv-theme'))).toBe(chosen)

    await page.reload()
    // Read before any interaction: if the inline script did not run first, the
    // attribute would be absent here and the page would have flashed.
    expect(await page.locator('html').getAttribute('data-theme')).toBe(chosen)

    // Hydration mismatches surface as console errors, so this covers them too.
    expect(problems).toEqual([])
  })

  test('the choice carries across a navigation', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Switch to (light|dark) mode/ }).click()
    const chosen = await page.locator('html').getAttribute('data-theme')

    await page.getByRole('link', { name: 'How it works' }).first().click()
    await expect(page).toHaveURL(/\/methodology$/)
    expect(await page.locator('html').getAttribute('data-theme')).toBe(chosen)
  })
})
