import { expect, test, type Page } from '@playwright/test'

/**
 * The things that only break on a phone.
 *
 * A production audit at Pixel 7 width found two classes of bug this file
 * exists to keep out: source tables running past the edge of a viewport whose
 * overflow is hidden, and a hydration mismatch on `/history` that the desktop
 * run never reproduced. Both were invisible to every other test in the suite,
 * because both need a narrow viewport and a real browser at once.
 */

const NARROW = [320, 360, 375, 390, 412] as const
const TABLET = 768

test('the category field stays inside the search panel on a small phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 850 })
  await page.goto('/')
  const field = await page.getByLabel('Use for').boundingBox()
  const panel = await page.locator('#search .panel').boundingBox()
  expect(field!.x + field!.width).toBeLessThanOrEqual(panel!.x + panel!.width - 16)
})

/** Every route with a table of sources on it. */
const TABLE_ROUTES = ['/how-it-works', '/status'] as const

/**
 * Anything wider than the viewport that cannot be scrolled to.
 *
 * The distinction is the whole test. A table inside a scroll container is
 * fine — the reader can reach the rest of it. The same table inside a
 * container with `overflow: hidden` has silently deleted a column, and the
 * page's `overflow-x-hidden` body means the page itself never scrolls to
 * reveal it.
 */
async function clippedElements(page: Page): Promise<{ tag: string; cls: string }[]> {
  return page.evaluate(() => {
    const viewport = document.documentElement.clientWidth
    const out: { tag: string; cls: string }[] = []

    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      if (rect.right <= viewport + 1 && rect.left >= -1) continue

      let parent = el.parentElement
      let reachable = false
      while (parent !== null) {
        const style = getComputedStyle(parent)
        const scrolls = style.overflowX === 'auto' || style.overflowX === 'scroll'
        if (scrolls && parent.scrollWidth > parent.clientWidth) {
          reachable = true
          break
        }
        parent = parent.parentElement
      }

      if (!reachable) {
        out.push({ tag: el.tagName, cls: String(el.className).slice(0, 60) })
      }
    }
    return out
  })
}

/** Open every fold, so the tables inside them are actually measured. */
async function expandAll(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const details of Array.from(document.querySelectorAll('details'))) {
      details.open = true
    }
  })
}

test.describe('source tables on a narrow screen', () => {
  for (const route of TABLE_ROUTES) {
    for (const width of NARROW) {
      test(`${route} keeps every column reachable at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 })
        await page.goto(route)
        await expandAll(page)

        expect(
          await clippedElements(page),
          'content wider than the viewport must sit in a scrollable region, not a hidden one',
        ).toEqual([])

        // And the page itself must not scroll sideways.
        const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
        expect(bodyWidth).toBeLessThanOrEqual(width)
      })
    }

    test(`${route} keeps the fields that matter on a phone`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 800 })
      await page.goto(route)
      await expandAll(page)

      // Less-important columns may become secondary; these may not disappear.
      const text = await page.locator('main').innerText()
      expect(text).toContain('GitHub')
      expect(text.toLowerCase()).toMatch(/group|ceiling/)
    })

    for (const width of [TABLET, 1280]) {
      test(`${route} is still whole at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(route)
        await expandAll(page)
        expect(await clippedElements(page)).toEqual([])
      })
    }
  }
})

test.describe('hydration', () => {
  /**
   * Routes that render a timestamp, which is where every hydration mismatch in
   * this app has come from: `Date.now()` moves between the server render and
   * the client's, and `toLocaleDateString()` reads a locale the two do not
   * share.
   */
  for (const route of ['/history', '/saved', '/']) {
    test(`${route} hydrates without a React error`, async ({ page }) => {
      const failures: string[] = []
      page.on('pageerror', (error) => failures.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') failures.push(message.text())
      })

      await page.goto(route)
      await page.waitForLoadState('networkidle')

      // React reports a text mismatch as minified error #418 in production and
      // as a "did not match" warning in development. Neither is acceptable.
      expect(failures.filter((f) => /418|423|425|hydrat/i.test(f))).toEqual([])
      expect(failures).toEqual([])
    })
  }

  test('a relative timestamp carries its machine-readable value', async ({ page }) => {
    await page.goto('/history')
    const times = page.locator('time[datetime]')
    // Zero is legitimate — an empty history — but any that render must be
    // marked up, so the exact instant survives the "3d ago" rendering.
    const count = await times.count()
    for (let i = 0; i < count; i++) {
      expect(await times.nth(i).getAttribute('datetime')).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
  })
})

test.describe('private routes on mobile', () => {
  test('signed-out history shows a sign-in gate rather than saved research', async ({ page }) => {
    await page.goto('/history')
    await expect(page.getByText('Your history is private to your account.')).toBeVisible()
    await expect(page.locator('main').getByRole('link', { name: 'Sign in', exact: true })).toBeVisible()
    await expect(page.getByRole('searchbox', { name: 'Search history by name' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Open report' })).toHaveCount(0)
  })
  test('/history is noindex and declares no canonical of its own', async ({ page }) => {
    await page.goto('/history')
    expect(await page.locator('meta[name="robots"]').getAttribute('content')).toContain('noindex')
    // Inheriting the homepage's canonical told a crawler this page *was* the
    // homepage while also telling it not to index the page.
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0)
  })
})
