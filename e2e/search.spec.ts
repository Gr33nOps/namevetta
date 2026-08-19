import { expect, test } from '@playwright/test'

test.describe('the search form', () => {
  test('Ctrl+K focuses the search box from anywhere on the page', async ({ page }) => {
    await page.goto('/')

    const input = page.getByLabel('Name to research')
    await page.locator('footer').click({ position: { x: 5, y: 5 } })
    await expect(input).not.toBeFocused()

    await page.keyboard.press('Control+k')
    await expect(input).toBeFocused()
  })

  test('typing a name reveals the context controls', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByLabel('Category')).toBeHidden()
    await page.getByLabel('Name to research').fill('northbeam')
    await expect(page.getByLabel('Category')).toBeVisible()
    await expect(page.getByLabel(/Description/)).toBeVisible()
  })

  test('submitting carries the whole context into the scan URL', async ({ page }) => {
    // Stubbed so the suite never spends real requests against GitHub, npm or
    // any other upstream. What is under test is the client wiring, not the
    // sources, which `src/lib/sources/**` already covers.
    await page.route('**/api/scan', async (route) => {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Daily limit reached.' }),
      })
    })

    await page.goto('/')
    await page.getByLabel('Name to research').fill('northbeam')
    await page.getByLabel('Category').selectOption('saas')
    await page.getByLabel(/Description/).fill('analytics for online stores')
    await page.getByRole('button', { name: /Run Quick Check/ }).click()

    await page.waitForURL(/\/scan\?/)
    const url = new URL(page.url())
    expect(url.searchParams.get('name')).toBe('northbeam')
    expect(url.searchParams.get('category')).toBe('saas')
    expect(url.searchParams.get('type')).toBe('quick')
    expect(url.searchParams.get('description')).toBe('analytics for online stores')

    // The refusal reaches the user rather than leaving a spinner running.
    await expect(page.getByText('Daily limit reached.')).toBeVisible()
  })

  test('a malformed scan URL explains itself instead of crashing', async ({ page }) => {
    const response = await page.goto('/scan?name=&category=not-a-category&type=quick')
    expect(response?.status()).toBe(200)

    await expect(page.getByRole('heading', { name: /was not valid/ })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Start a new search' })).toBeVisible()
  })
})
