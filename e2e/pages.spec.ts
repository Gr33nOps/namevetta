import { expect, test } from '@playwright/test'

/** Every page a search engine or a first-time visitor can reach. */
const PUBLIC_ROUTES = ['/', '/generate', '/compare', '/methodology', '/status', '/terms', '/privacy']

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

  test('methodology is marked as an article, not as an FAQ it does not contain', async ({
    page,
  }) => {
    await page.goto('/methodology')
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents()
    const types = blocks.map((b) => (JSON.parse(b) as { '@type': string })['@type'])

    expect(types).toContain('TechArticle')
    // The page shows numbered sections, not questions and answers. Claiming
    // FAQPage would be structured data the page does not back up.
    expect(types).not.toContain('FAQPage')
  })

  test('a theme colour is declared for each mode', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(2)
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
    for (const route of ['/generate', '/compare', '/methodology', '/privacy']) {
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
})
