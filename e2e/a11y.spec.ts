import { expect, test } from '@playwright/test'

test.describe('keyboard access', () => {
  test('the skip link is the first stop and jumps past the nav', async ({ page }) => {
    await page.goto('/')

    // Asserted structurally rather than by pressing Tab: the homepage autofocuses
    // the search box, which moves the browser's sequential-focus starting point,
    // and nothing resets that reliably from a test. Nothing here uses a positive
    // tabindex, so "first tabbable in DOM order" is exactly "first Tab stop".
    const first = await page.evaluate(() => {
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>(
          'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex >= 0)
      return nodes[0]?.textContent?.trim() ?? null
    })
    expect(first).toBe('Skip to content')

    const skip = page.locator('a[href="#content"]')

    // Hidden until focused, and genuinely visible once it is. A skip link that
    // stays clipped on focus is worse than none: it takes a Tab stop and shows
    // the user nothing.
    const clipped = await skip.boundingBox()
    await skip.focus()
    const shown = await skip.boundingBox()
    expect(shown?.width ?? 0).toBeGreaterThan(clipped?.width ?? 0)
    expect(shown?.width ?? 0).toBeGreaterThan(50)

    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#content$/)
    await expect(page.locator('main#content')).toBeVisible()
  })

  test('research depth is a radio group, not a row of toggles', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Name to research').fill('testname')

    const group = page.getByRole('radiogroup', { name: 'Research depth' })
    await expect(group).toBeVisible()

    const quick = page.getByRole('radio', { name: /Quick Check/ })
    const deep = page.getByRole('radio', { name: /Deep Research/ })

    await expect(quick).toHaveAttribute('aria-checked', 'true')
    await expect(deep).toHaveAttribute('aria-checked', 'false')

    // One tab stop, arrows to move: the pattern a radio group owes a keyboard.
    await quick.focus()
    await page.keyboard.press('ArrowRight')
    await expect(deep).toHaveAttribute('aria-checked', 'true')
    await expect(deep).toBeFocused()

    await page.keyboard.press('ArrowLeft')
    await expect(quick).toHaveAttribute('aria-checked', 'true')
  })
})

test.describe('landmarks and structure', () => {
  test('both navigation landmarks are named', async ({ page }) => {
    await page.goto('/')
    // Two nav elements render (one per breakpoint). Unnamed, a screen reader's
    // landmark list reads "navigation, navigation".
    for (const nav of await page.locator('nav').all()) {
      const label = await nav.getAttribute('aria-label')
      expect(label, 'every nav landmark needs a name').toBeTruthy()
    }
  })

  test('footer link lists are associated with their headings', async ({ page }) => {
    await page.goto('/')
    for (const heading of ['Product', 'How it works', 'Legal']) {
      await expect(page.getByRole('list', { name: heading })).toBeVisible()
    }
  })

  test('the source status table exposes row and column headers', async ({ page }) => {
    await page.goto('/status')
    const table = page.locator('table')
    // The table only renders when a database is configured. Where it does, its
    // headers must be real headers.
    if ((await table.count()) === 0) test.skip()
    await expect(table.locator('th[scope="col"]')).toHaveCount(4)
    expect(await table.locator('th[scope="row"]').count()).toBeGreaterThan(0)
  })
})

test.describe('page health', () => {
  test('the homepage loads with no console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/')
    await page.waitForLoadState('networkidle')
    expect(errors).toEqual([])
  })
})
