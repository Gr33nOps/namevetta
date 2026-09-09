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

})

test.describe('landmarks and structure', () => {
  test('any navigation landmark is named', async ({ page }) => {
    await page.goto('/')
    for (const nav of await page.locator('nav').all()) {
      expect(await nav.getAttribute('aria-label'), 'every nav landmark needs a name').toBeTruthy()
    }
  })

  test('the footer is one line of links', async ({ page }) => {
    await page.goto('/')
    for (const label of ['How it works', 'Source status', 'Privacy', 'Terms']) {
      await expect(page.getByRole('contentinfo').getByRole('link', { name: label })).toBeVisible()
    }
  })

  test('the source status table exposes row and column headers', async ({ page }) => {
    await page.goto('/status')
    const table = page.locator('table')
    // The table only renders when a database is configured. Where it does, its
    // headers must be real headers.
    if ((await table.count()) === 0) test.skip()
    // Five since "When it runs" was added: a reader cannot judge a success
    // rate without knowing whether the source runs on every search.
    await expect(table.locator('th[scope="col"]')).toHaveCount(5)
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
