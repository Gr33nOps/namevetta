import { expect, test, type Page } from '@playwright/test'

/** Every page a search engine or a first-time visitor can reach. */
const PUBLIC_ROUTES = ['/', '/how-it-works', '/generate', '/status', '/terms', '/privacy']

test.describe('public pages', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} renders with one h1 and a title`, async ({ page }) => {
      const response = await page.goto(route)
      expect(response?.status()).toBe(200)

      // Exactly one, not "at least one": a second h1 means two competing page
      // titles, which is what screen reader and search-engine heuristics both
      // key off.
      await expect(page.locator('h1')).toHaveCount(1)
      await expect(page.locator('h1')).not.toBeEmpty()
      expect(await page.title()).not.toBe('')
    })

    test(`${route} declares a canonical URL`, async ({ page }) => {
      await page.goto(route)
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href')
      expect(canonical).toBeTruthy()
      // Absolute, which is the whole point of metadataBase.
      expect(canonical).toMatch(/^https?:\/\//)
    })
  }
})

test.describe('authentication response privacy', () => {
  for (const route of ['/auth', '/auth/reset']) {
    test(`${route} is not publicly cacheable`, async ({ page }) => {
      const response = await page.goto(route)
      expect(response?.status()).toBe(200)

      const cacheControl = response?.headers()['cache-control'] ?? ''
      expect(cacheControl).not.toMatch(/(?:^|,\s*)public\b/)
      expect(cacheControl).not.toContain('s-maxage')
      expect(cacheControl).toContain('must-revalidate')
    })
  }

  test('an unauthenticated data export is private and never cached publicly', async ({ request }) => {
    const response = await request.get('/api/account/export')
    expect(response.status()).toBe(401)
    const cacheControl = response.headers()['cache-control'] ?? ''
    expect(cacheControl).toContain('private')
    expect(cacheControl).toContain('no-store')
    expect(cacheControl).not.toMatch(/(?:^|,\s*)public\b/)
  })
})

test.describe('social and structured metadata', () => {
  test('the homepage has an absolute Open Graph image and a Twitter card', async ({ page }) => {
    await page.goto('/')

    const image = await page.locator('meta[property="og:image"]').first().getAttribute('content')
    expect(image, 'og:image must exist').toBeTruthy()
    expect(image, 'og:image must be absolute, not a preview-deployment path').toMatch(
      /^https?:\/\//,
    )

    await expect(page.locator('meta[property="og:title"]')).toHaveCount(1)
    expect(await page.locator('meta[name="twitter:card"]').getAttribute('content')).toBe(
      'summary_large_image',
    )
  })

  test('the homepage publishes valid WebApplication structured data', async ({ page }) => {
    await page.goto('/')
    const raw = await page.locator('script[type="application/ld+json"]').first().textContent()
    expect(raw).toBeTruthy()

    const data = JSON.parse(raw ?? '{}') as Record<string, unknown>
    expect(data['@type']).toBe('WebApplication')
    expect(data['@context']).toBe('https://schema.org')
    expect(typeof data.url).toBe('string')
  })

  test('a theme colour is declared, and only one', async ({ page }) => {
    await page.goto('/')
    // `networkidle`, not `load`: the duplicate this guards against appeared
    // during hydration, so a check that runs before hydration cannot see it.
    await page.waitForLoadState('networkidle')
    /*
      One tag, even though there are two palettes.

      The obvious alternative is two, each behind a `prefers-color-scheme`
      media attribute, but that ties the browser chrome to the *system* while
      the page follows the visitor's own choice. One tag, rewritten in place,
      can never disagree with what is on screen.
    */
    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1)
  })

  /**
   * Reads the page's canvas colour as sRGB rather than as a string. The
   * palette is declared with `light-dark()`, which `getComputedStyle` hands
   * back already resolved but in whatever space the engine settled on, so
   * pinning the serialisation would fail on a value that renders identically.
   */
  const canvas = async (page: Page): Promise<number> =>
    page.evaluate(() => {
      const el = document.createElement('canvas')
      el.width = el.height = 1
      const ctx = el.getContext('2d')
      if (ctx === null) throw new Error('no 2d context')
      ctx.fillStyle = getComputedStyle(document.body).backgroundColor
      ctx.fillRect(0, 0, 1, 1)
      // Defaults because the array is indexed: a 1x1 fill always returns four
      // bytes, but the type says every index may be undefined.
      const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data
      return Math.max(r, g, b)
    })

  test('follows the system preference when nothing has been chosen', async ({ browser }) => {
    // No stored choice, so `color-scheme: light dark` should resolve on its own
    // and no attribute should have been written.
    for (const [scheme, assertion] of [
      ['light', (v: number) => expect(v).toBeGreaterThan(230)],
      ['dark', (v: number) => expect(v).toBeLessThan(40)],
    ] as const) {
      const context = await browser.newContext({ colorScheme: scheme })
      const page = await context.newPage()
      await page.goto('/')
      assertion(await canvas(page))
      await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/)
      await context.close()
    }
  })

  test('a chosen theme outranks the system, and survives a reload', async ({ browser }) => {
    // System dark, visitor picks light: the choice wins, and keeps winning.
    const context = await browser.newContext({ colorScheme: 'dark' })
    const page = await context.newPage()
    await page.goto('/')
    expect(await canvas(page)).toBeLessThan(40)

    await page.getByRole('button', { name: /switch to light mode/i }).click()
    expect(await canvas(page)).toBeGreaterThan(230)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    // The reload is the point: the bootstrap script has to re-apply it before
    // paint, from storage, without mutating React-owned markup.
    await page.reload()
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/)
    expect(await canvas(page)).toBeGreaterThan(230)

    // And the chrome colour follows the page rather than the system.
    await page.waitForLoadState('networkidle')
    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1)
    expect(await page.locator('meta[name="theme-color"]').getAttribute('content')).toBe('#f8f9fb')
    await context.close()
  })

  test('the chrome colour follows the system when nothing has been chosen', async ({ browser }) => {
    /*
      The case the bootstrap script nearly missed. With no stored choice the
      CSS follows `prefers-color-scheme` on its own and never touches the
      attribute, so it is easy to leave `theme-color` at the light default —
      which draws a white bar above a black page on a phone.
    */
    const context = await browser.newContext({ colorScheme: 'dark' })
    const page = await context.newPage()
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/)
    /*
      One tag, still, *after* hydration.

      React 19 hoists `<meta>` and will not adopt a node whose attributes
      something else changed — so while React rendered this tag and the
      pre-paint script mutated it, hydration inserted a second one and the
      browser honoured the last. The page rendered dark and the chrome went
      light. The script owns the element outright now, and this count is what
      would catch a well-meaning `export const viewport` putting it back.
    */
    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1)
    expect(await page.locator('meta[name="theme-color"]').getAttribute('content')).toBe('#111316')
    await context.close()
  })

  test('the toggle is labelled by what it does, not by what is on', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'light' })
    const page = await context.newPage()
    await page.goto('/')
    // In light mode it offers dark, and only that: two toggles, or one that
    // announces the current state, is the ambiguity this label avoids.
    await expect(page.getByRole('button', { name: /switch to dark mode/i })).toHaveCount(1)
    await expect(page.getByRole('button', { name: /switch to light mode/i })).toHaveCount(0)
    await context.close()
  })
})

test.describe('crawler directives', () => {
  test('robots.txt points at the sitemap and hides private routes', async ({ request }) => {
    const response = await request.get('/robots.txt')
    expect(response.status()).toBe(200)

    const body = await response.text()
    expect(body).toContain('Sitemap:')
    for (const path of ['/api/', '/account', '/history', '/saved', '/r/']) {
      expect(body).toContain(path)
    }
  })

  test('the sitemap lists the public routes with absolute URLs', async ({ request }) => {
    const response = await request.get('/sitemap.xml')
    expect(response.status()).toBe(200)

    const body = await response.text()
    for (const route of ['/how-it-works', '/generate', '/status', '/privacy']) {
      expect(body).toContain(route)
    }
    expect(body).toMatch(/<loc>https?:\/\//)
  })

  test('an account page is noindex in the markup, not only in robots.txt', async ({ page }) => {
    // A disallow only asks a crawler not to fetch. Anything it reaches another
    // way can still be indexed without this tag.
    await page.goto('/auth')
    const robots = await page.locator('meta[name="robots"]').getAttribute('content')
    expect(robots).toContain('noindex')
  })

  test('the sign-in page offers configured social sign-in paths', async ({ page }) => {
    await page.goto('/auth')
    const google = page.getByRole('button', { name: 'Continue with Google' })
    await expect(google).toBeVisible()
    await expect(google.locator('svg')).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Continue with GitHub' })).toBeVisible()
  })
})

test.describe('name generation validation', () => {
  test('empty and whitespace-only descriptions never reach the API', async ({ page }) => {
    let requests = 0
    await page.route('**/api/generate', async (route) => {
      requests += 1
      await route.fulfill({ status: 500, body: '{}' })
    })
    await page.goto('/generate')

    const description = page.getByLabel('What are you naming?')
    await page.getByRole('button', { name: 'Generate ideas' }).click()
    await expect(page.getByText('Describe what you are naming', { exact: false })).toBeVisible()
    await expect(description).toBeFocused()
    expect(requests).toBe(0)

    await description.fill('     ')
    await page.getByRole('button', { name: 'Generate ideas' }).click()
    await expect(page.getByText('Describe what you are naming', { exact: false })).toBeVisible()
    expect(requests).toBe(0)
  })

  test('a meaningful description reaches the API without exposing the candidate pool', async ({ page }) => {
    let requests = 0
    await page.route('**/api/generate', async (route) => {
      requests += 1
      await route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson',
        body: `${JSON.stringify({ type: 'screening' })}\n${JSON.stringify({ type: 'error', message: 'Test stop.' })}\n`,
      })
    })
    await page.goto('/generate')
    await page.getByLabel('What are you naming?').fill('A planning tool for small design teams')
    await page.getByLabel('Starting point').fill('Canvas')
    await page.getByRole('button', { name: 'Generate ideas' }).click()

    await expect(page.getByText('Test stop.')).toBeVisible()
    expect(requests).toBe(1)
    await expect(page.getByText(/of \d+ candidates/i)).toHaveCount(0)
    await expect(page.getByText(/discarded during screening/i)).toHaveCount(0)
  })
})

test('Ideas gives a clear route back to a name check', async ({ page }) => {
  await page.goto('/generate')
  const search = page.getByRole('link', { name: 'Search a name' })
  await expect(search).toBeVisible()
  await search.click()
  await expect(page).toHaveURL('/')
})

test('primary navigation keeps four destinations visible and marks the current page', async ({ page }) => {
  await page.goto('/generate')
  const nav = page.getByRole('navigation', { name: 'Main' })
  await expect(nav.getByRole('link')).toHaveCount(4)
  await expect(nav.getByRole('link', { name: 'Generate ideas' })).toHaveAttribute('aria-current', 'page')
  await expect(nav.getByRole('link', { name: 'Search a name' })).not.toHaveAttribute('aria-current', 'page')
})

test('primary navigation fits a compact screen without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Main' })
  await expect(nav.getByRole('link')).toHaveCount(4)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth),
  )
})

test('removed sources stay out of the active catalog UI', async ({ page }) => {
  for (const route of ['/how-it-works', '/status']) {
    await page.goto(route)
    await expect(page.getByText('Product Hunt', { exact: true })).toHaveCount(0)
    await expect(page.getByText('last.fm', { exact: true })).toHaveCount(0)
  }

})

test('the footer provides the public showcase and support destinations', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('link', { name: 'GitHub showcase' })).toHaveAttribute(
    'href',
    'https://github.com/Gr33nOps/namevetta',
  )
  await expect(page.getByRole('link', { name: 'Support' })).toHaveAttribute(
    'href',
    'https://ko-fi.com/zain021xd',
  )
})
