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
          viability: {
            score: 61,
            rawScore: 61,
            caps: [],
            // Empty on purpose: the domain conflict below carries evidence
            // rather than an exact match, so it is not a decisive collision.
            conflicts: [],
            groups: [],
            scoringVersion: 3,
          },
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
  test('lets a visitor choose category and research depth before a check starts', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByLabel('Name to check')).toBeVisible()
    await expect(page.getByLabel('Use for')).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Quick Check' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Deep Research' })).toBeVisible()
    await expect(page.getByRole('textbox')).toHaveCount(1)
  })

  test('a name goes straight to its own readable URL', async ({ page }) => {
    await stubScan(page)
    await page.goto('/')

    await page.getByLabel('Name to check').fill('northbeam')
    await page.getByRole('button', { name: 'Search a name' }).click()

    await expect(page).toHaveURL(/\/n\/northbeam\?as=other$/)
  })

  test('carries the selected category and depth into the check URL', async ({ page }) => {
    await stubScan(page)
    await page.goto('/')
    await page.getByLabel('Use for').click()
    await page.getByRole('option', { name: 'Mobile app' }).click()
    await page.getByRole('button', { name: 'Deep Research' }).click()
    await page.getByLabel('Name to check').fill('northbeam')
    await page.getByRole('button', { name: 'Search a name' }).click()

    await expect(page).toHaveURL(/\/n\/northbeam\?as=mobile_app&deep=1$/)
  })

  test('shows the full report once the check finishes', async ({ page }) => {
    await stubScan(page)
    await page.goto('/n/northbeam')

    await expect(page.getByRole('heading', { name: 'northbeam' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible()
    // The score is still on the page, still a number, just no longer the first
    // thing shouting at you. It reads as a ring labelled "Score" now,
    // with the count of what actually came back clear beside it.
    await expect(page.getByText('Score', { exact: true })).toBeVisible()
    await expect(page.getByText(/\d+ of \d+ automatic checks clear/)).toBeVisible()
  })

  test('leads with the findings that need a decision', async ({ page }) => {
    await stubScan(page)
    await page.goto('/n/northbeam')
    await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible()

    const body = await page.locator('main').innerText()
    // The whole point of the restructure: the two things worth reading come
    // before the pile of things that were fine.
    expect(body.indexOf('Review')).toBeLessThan(body.indexOf('clear checks'))
    expect(body.indexOf('Review')).toBeLessThan(body.indexOf('Trademark search'))
  })

  test('the verdict word does not outrank the findings under it', async ({ page }) => {
    await stubScan(page)
    await page.goto('/n/northbeam')
    await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible()

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
    await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible()

    const fold = page.locator('details', { hasText: 'clear checks' }).first()
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
    // The name is up immediately, and the panel says what it is waiting on
    // rather than showing an empty box.
    await expect(page.getByRole('heading', { name: 'northbeam' })).toBeVisible()
    /*
      The progress line names the run set *and* the catalog, because they are
      different numbers: a Quick Check asks 53 of 60, and the page used to
      claim the catalog size was checked on every search.
    */
    await expect(
      page.getByText(/(Quick Check uses|Deep Research considers) \d+ sources/),
    ).toBeVisible()
    await expect(page.getByText(/of \d+ sources answered/)).toBeVisible()
    await expect(page.getByText('Score', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Checking your name' })).toBeVisible()
    await expect(page.locator('.loading-panel')).toHaveCSS('opacity', '1')
    await page.screenshot({ path: 'artifacts/ux-search-loading.png' })
    release()
  })

  test('an unverified source is never dressed up as a clean one', async ({ page }) => {
    await stubScan(page)
    await page.goto('/n/northbeam')
    await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible()

    // The rule the whole product rests on: a check that did not complete must
    // not read anywhere as a pass.
    await expect(page.getByRole('heading', { name: /Couldn.t verify/ })).toBeVisible()
    await expect(page.getByText(/doesn.t mean the name is free/)).toBeVisible()
  })

  test('manual platforms are grouped and a category-skipped store is shown once', async ({ page }) => {
    const intentionalResults = [
      {
        ...base,
        source: 'socials',
        status: 'manual_check_recommended',
        confidence: 0,
        meta: {
          platforms: [
            {
              name: 'Instagram',
              url: 'https://instagram.com/northbeam',
              status: 'manual_check_recommended',
              detail: 'Verify the account handle directly',
            },
            {
              name: 'Twitch',
              url: 'https://twitch.tv/northbeam',
              status: 'manual_check_recommended',
              detail: 'Verify the channel name directly',
            },
          ],
        },
      },
      {
        ...base,
        source: 'slack',
        status: 'manual_check_recommended',
        confidence: 0,
        meta: {
          platforms: [
            {
              name: 'Slack',
              url: 'https://northbeam.slack.com',
              status: 'manual_check_recommended',
              detail: 'Verify the workspace directly',
            },
          ],
        },
      },
      {
        ...base,
        source: 'play_store',
        status: 'unable_to_verify',
        confidence: 0,
        error: {
          code: 'NOT_SEARCHED',
          message: 'Google Play was not searched for this category.',
          retryable: false,
        },
      },
    ]

    await page.route('**/api/scan', async (route) => {
      const events = [
        { type: 'started' },
        ...intentionalResults.map((result) => ({ type: 'source', result })),
        {
          type: 'complete',
          summary: {
            results: intentionalResults,
            viability: {
              score: 0,
              rawScore: 0,
              caps: [],
              conflicts: [],
              groups: [],
              scoringVersion: 3,
            },
            coverage: 0,
          },
        },
      ]
      await route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson',
        body: events.map((event) => JSON.stringify(event)).join('\n') + '\n',
      })
    })

    await page.goto('/n/northbeam')

    await expect(page.getByText('Manual check', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Manual checks' })).toBeVisible()
    await expect(page.getByText('3 manual checks')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open ↗' })).toHaveCount(3)

    await expect(page.getByRole('heading', { name: "Couldn't be checked" })).toHaveCount(0)
    const otherUses = page.locator('details', { hasText: 'Relevant for other uses' })
    await expect(otherUses).toBeVisible()
    await otherUses.locator('summary').click()
    await expect(page.getByText('Google Play', { exact: true })).toHaveCount(1)
    await expect(page.getByRole('link', { name: 'Search Google Play ↗' })).toHaveAttribute(
      'href',
      /q=northbeam/,
    )
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
    await expect(page.getByRole('main').getByRole('link', { name: /sign in/i })).toHaveCount(0)

    await page.goto('/n/northbeam')
    await expect(page.getByRole('link', { name: 'Sign in for more' })).toBeVisible()
    // A daily limit is not an error, and must not be painted as one.
    await expect(page.getByText('The scan could not complete')).toHaveCount(0)
  })
})
