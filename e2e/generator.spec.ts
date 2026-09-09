import { expect, test } from '@playwright/test'

test('a name check that ends without a summary offers a retry', async ({ page }) => {
  await page.route('**/api/scan', (route) => route.fulfill({ contentType: 'application/x-ndjson', body: '{"type":"started"}\n' }))
  await page.goto('/n/Maplefield?as=restaurant')
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
})

test('an interrupted generation stream offers recovery instead of spinning forever', async ({ page }) => {
  let requests = 0
  await page.route('**/api/generate', (route) => { requests++; return route.fulfill({
    contentType: 'application/x-ndjson', body: '{"type":"screening"}\n',
  }) })
  await page.goto('/generate')
  await page.getByLabel('What are you naming?', { exact: true }).fill('A neighbourhood bakery with seasonal bread')
  await page.getByRole('button', { name: 'Generate ideas' }).click()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect.poll(() => requests).toBe(2)
  await expect(page.getByRole('button', { name: 'Edit your brief' })).toBeVisible()
  await page.getByRole('button', { name: 'Edit your brief' }).click()
  await expect(page.getByLabel('What are you naming?', { exact: true })).toHaveValue('A neighbourhood bakery with seasonal bread')
})

test('a final result without a trailing newline still completes', async ({ page }) => {
  const candidates = ['Cedar Table', 'Copper Apron', 'Sunday Crumb', 'Orchard Oven'].map((name, index) => ({ name, rank: index + 1, score: 85, coverage: 80, verdict: 'promising', groups: [], strengths: [], weaknesses: [], caps: [], domain: { name: name.replaceAll(' ', '').toLowerCase() + '.com', checkedAt: new Date().toISOString() } }))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/api/generate', (route) => route.fulfill({
    contentType: 'application/x-ndjson',
    body: JSON.stringify({ type: 'result', ranked: { candidates, winner: null, winnerReason: '', tooCloseToCall: false } }),
  }))
  await page.goto('/generate')
  await page.getByLabel('What are you naming?', { exact: true }).fill('A small independent bookshop')
  await page.getByRole('button', { name: 'Generate ideas' }).click()
  await expect(page.getByRole('button', { name: 'Edit your brief' })).toBeVisible()
  await expect(page.locator('article')).toHaveCount(4)
  await expect(page.getByText('cedartable.com')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await expect(page.getByText('Strongest candidate')).toHaveCount(0)
})

test('an incomplete shortlist cannot appear as a successful generation', async ({ page }) => {
  await page.route('**/api/generate', (route) => route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'result', ranked: { candidates: [] } }) }))
  await page.goto('/generate')
  await page.getByLabel('What are you naming?', { exact: true }).fill('An independent bookshop')
  await page.getByRole('button', { name: 'Generate ideas' }).click()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  await expect(page.getByText('This run did not produce four checked names. Please try again.')).toBeVisible()
})

test('loading remains cancellable and respects reduced motion', async ({ page }) => {
  let release!: () => void
  const pending = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/api/generate', async (route) => {
    await pending
    await route.abort().catch(() => {})
  })
  try {
    await page.goto('/generate')
    await page.getByLabel('What are you naming?', { exact: true }).fill('An independent bakery making seasonal bread')
    await page.getByRole('button', { name: 'Generate ideas' }).click()
    await expect(page.getByRole('heading', { name: 'Finding your naming direction' })).toBeVisible()
    await expect(page.locator('.loading-tile').first()).toHaveCSS('animation-name', 'tile-float')
    await expect(page.locator('.loading-panel')).toHaveCSS('opacity', '1')
    await page.screenshot({ path: 'artifacts/motion-loading.png' })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.locator('.loading-tile').first()).toHaveCSS('animation-name', 'none')
    await page.getByRole('button', { name: 'Back to your brief' }).click()
    await expect(page.getByLabel('What are you naming?', { exact: true })).toHaveValue('An independent bakery making seasonal bread')
  } finally { release() }
})
