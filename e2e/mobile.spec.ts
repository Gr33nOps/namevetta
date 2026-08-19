import { expect, test } from '@playwright/test'

test.describe('mobile navigation', () => {
  test('the menu opens and closes on Escape, returning focus to the toggle', async ({ page }) => {
    await page.goto('/')

    const toggle = page.getByRole('button', { name: 'Open menu' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(toggle).toHaveAttribute('aria-controls', 'mobile-menu')

    await toggle.click()
    await expect(page.locator('#mobile-menu')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Close menu' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )

    await page.keyboard.press('Escape')
    await expect(page.locator('#mobile-menu')).toBeHidden()
    // Focus must land somewhere real, not on a node that was just removed.
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused()
  })

  test('the menu closes when you tap outside it', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: 'Open menu' }).click()
    await expect(page.locator('#mobile-menu')).toBeVisible()

    await page.locator('footer').click({ position: { x: 5, y: 5 } })
    await expect(page.locator('#mobile-menu')).toBeHidden()
  })

  test('menu links navigate', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Open menu' }).click()
    await page.locator('#mobile-menu').getByRole('link', { name: 'Compare' }).click()
    await expect(page).toHaveURL(/\/compare$/)
  })
})

test.describe('mobile layout', () => {
  for (const route of ['/', '/methodology', '/compare', '/status']) {
    test(`${route} does not scroll sideways`, async ({ page }) => {
      await page.goto(route)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      // A wide table scrolls inside its own container; the page itself must not.
      expect(overflow).toBeLessThanOrEqual(1)
    })
  }
})
