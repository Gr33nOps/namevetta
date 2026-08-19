import { expect, test } from '@playwright/test'

const at = '2026-08-19T12:00:00.000Z'

const base = {
  confidence: 80,
  exactMatches: [],
  similarMatches: [],
  evidence: [],
  checkedAt: at,
  expiresAt: at,
  fromCache: false,
}

const RESULTS = [
  {
    ...base,
    source: 'domain',
    status: 'confirmed_conflict',
    evidence: [
      {
        label: 'northbeam.com: a registration record exists.',
        url: 'https://northbeam.com',
        source: 'domain',
        observedAt: at,
      },
    ],
  },
  { ...base, source: 'npm', status: 'no_conflict' },
  { ...base, source: 'homebrew', status: 'no_conflict' },
  { ...base, source: 'nuget', status: 'no_conflict' },
  {
    ...base,
    source: 'github',
    status: 'unable_to_verify',
    confidence: 0,
    error: { code: 'RATE', message: 'GitHub rate limit reached', retryable: true },
  },
]

/**
 * A finished check, stubbed.
 *
 * Running one for real spends a check and calls every source. What is under
 * test is the screen, not the research, which `src/lib/**` covers.
 */
async function stubScan(page: import('@playwright/test').Page) {
  await page.route('**/api/scan', async (route) => {
    const events = [
      { type: 'started' },
      ...RESULTS.map((result) => ({ type: 'source', result })),
      {
        type: 'complete',
        summary: {
          results: RESULTS,
          viability: { score: 61, rawScore: 61, caps: [], groups: [], scoringVersion: 2 },
          coverage: 70,
        },
      },
    ]
    await route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: events.map((e) => JSON.stringify(e)).join('\n') + '\n',
    })
  })
}

test.describe('search', () => {
  test('asks nothing before giving an answer', async ({ page }) => {
    await page.goto('/')

    // The whole homepage: one field, one button. No category, no description,
    // no depth picker. If any of those come back, this fails.
    await expect(page.getByLabel('Name to check')).toBeVisible()
    await expect(page.getByRole('combobox')).toHaveCount(0)
    await expect(page.getByRole('textbox')).toHaveCount(1)
  })

  test('a name goes straight to its own readable URL', async ({ page }) => {
    await stubScan(page)
    await page.goto('/')

    await page.getByLabel('Name to check').fill('northbeam')
    await page.getByRole('button', { name: 'Check' }).click()

    await expect(page).toHaveURL(/\/n\/northbeam$/)
  })

  test('shows the full report once the check finishes', async ({ page }) => {
    await stubScan(page)
    await page.goto('/n/northbeam')

    await expect(page.getByRole('heading', { name: 'northbeam' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Needs your attention' })).toBeVisible()
    // The score is still on the page, still a number, just no longer the first
    // thing shouting at you.
    await expect(page.getByText('/ 100')).toBeVisible()
  })

  test('leads with the findings that need a decision', async ({ page }) => {
    await stubScan(page)
    await page.goto('/n/northbeam')
    await expect(page.getByRole('heading', { name: 'Needs your attention' })).toBeVisible()

    const body = await page.locator('main').innerText()
    // The whole point of the restructure: the two things worth reading come
    // before the pile of things that were fine.
    expect(body.indexOf('Needs your attention')).toBeLessThan(body.indexOf('are clear'))
    expect(body.indexOf('Needs your attention')).toBeLessThan(body.indexOf('Trademark search'))
  })

  test('the verdict word does not outrank the findings under it', async ({ page }) => {
    await stubScan(page)
    await page.goto('/n/northbeam')
    await expect(page.getByRole('heading', { name: 'Needs your attention' })).toBeVisible()

    // The stub scores 61 with a confirmed conflict below it. Whatever word sits
    // above the score, a report carrying an unresolved finding must never top
    // out at the best one in the vocabulary.
    await expect(page.getByRole('heading', { name: 'Clear', exact: true })).toHaveCount(0)
  })

  test('the headline admits what it did not establish', async ({ page }) => {
    await stubScan(page)
    await page.goto('/n/northbeam')

    // A verdict that says "clear" above two unresolved sources is the report
    // contradicting itself. The sentence has to carry the counts.
    await expect(page.getByText(/could(n't| not) be checked/).first()).toBeVisible()
  })

  test('the clear sources are folded away, not deleted', async ({ page }) => {
    await stubScan(page)
    await page.goto('/n/northbeam')
    await expect(page.getByRole('heading', { name: 'Needs your attention' })).toBeVisible()

    const fold = page.locator('details', { hasText: 'are clear' }).first()
    await expect(fold).toBeVisible()
    // Closed on arrival, and everything still inside it.
    expect(await fold.evaluate((el: HTMLDetailsElement) => el.open)).toBe(false)
    await fold.locator('summary').click()
    await expect(fold.getByText('npm', { exact: true })).toBeVisible()
  })

  test('reports progress while it runs rather than a blank wait', async ({ page }) => {
    // Held open so the loading state is observable instead of a race.
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })

    await page.route('**/api/scan', async (route) => {
      await held
      await route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson',
        body: JSON.stringify({ type: 'started' }) + '\n',
      })
    })

    await page.goto('/n/northbeam')
    await expect(page.getByText(/Researching/)).toBeVisible()
    await expect(page.getByText(/of \d+ sources complete/)).toBeVisible()
    release()
  })

  test('an unverified source is never dressed up as a clean one', async ({ page }) => {
    await stubScan(page)
    await page.goto('/n/northbeam')
    await expect(page.getByRole('heading', { name: 'Needs your attention' })).toBeVisible()

    // The rule the whole product rests on: a check that did not complete must
    // not read anywhere as a pass.
    await expect(page.getByRole('heading', { name: /Couldn.t be checked/ })).toBeVisible()
    await expect(page.getByText(/not evidence that the name is free/)).toBeVisible()
  })

  test('the old scan URL still works', async ({ page }) => {
    await stubScan(page)
    await page.goto('/scan?name=northbeam&category=saas&type=quick')
    await expect(page).toHaveURL(/\/n\/northbeam\?as=saas$/)
  })

  test('offers an account only after the checks run out', async ({ page }) => {
    await page.route('**/api/scan', async (route) => {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ error: "That's your 50 checks for today." }),
      })
    })

    await page.goto('/')
    // Nothing about signing up before the user has had anything.
    await expect(page.getByRole('link', { name: /sign in/i })).toHaveCount(0)

    await page.goto('/n/northbeam')
    await expect(page.getByRole('link', { name: 'Sign in for more' })).toBeVisible()
    // A daily limit is not an error, and must not be painted as one.
    await expect(page.getByText('The scan could not complete')).toHaveCount(0)
  })
})
