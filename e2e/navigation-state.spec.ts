import { expect, test } from '@playwright/test'

for (const kind of ['scan', 'generate'] as const) {
  test(`${kind} continues across navigation and preserves its outcome and inputs`, async ({ page }) => {
    let requests = 0
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    await page.route(`**/api/${kind}`, async route => {
      requests++
      await pending
      await route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'error', message: 'Completed while you were away.' }) + '\n' }).catch(() => {})
    })
    try {
      await page.goto(kind === 'scan' ? '/n/Stay4Credits?as=mobile_app' : '/generate')
      if (kind === 'generate') {
        await page.getByLabel('What are you naming?', { exact: true }).fill('A mobile app for keeping track of film credits')
        await page.getByRole('button', { name: 'Generate ideas', exact: true }).click()
      }
      await expect.poll(() => requests).toBe(1)
      await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: /Saved/ }).click()
      await expect(page).toHaveURL(/\/saved/)
      await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: kind === 'scan' ? /Search/ : /Ideas|Generate/ }).click()
      if (kind === 'scan') await expect(page).toHaveURL(/\/n\/Stay4Credits/)
      await expect(page.getByText('Completed while you were away.', { exact: true })).toHaveCount(0)
      release()
      await expect(page.getByText('Completed while you were away.', { exact: true })).toBeVisible()
      expect(requests).toBe(1)
      await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: /Saved/ }).click()
      await expect(page).toHaveURL(/\/saved/)
      await page.goBack()
      await expect(page).toHaveURL(kind === 'scan' ? /\/n\/Stay4Credits/ : /\/generate/)
      await expect(page.getByText('Completed while you were away.', { exact: true })).toBeVisible()
      expect(requests).toBe(1)
      if (kind === 'generate') {
        await page.getByRole('button', { name: 'Edit your brief' }).click()
        await expect(page.getByLabel('What are you naming?', { exact: true })).toHaveValue('A mobile app for keeping track of film credits')
      }
    } finally { release() }
  })
}

test('generation preserves streaming progress, finishes while away, and restores the shortlist', async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      if (String(input) !== '/api/generate') return original(input, init)
      const encoder = new TextEncoder()
      const body = new ReadableStream({ start(controller) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'screening' }) + '\n' + JSON.stringify({ type: 'progress', checked: 3, accepted: 1, message: 'Three names checked.' }) + '\n'))
        const finish = (event: Event) => {
          controller.enqueue(encoder.encode(JSON.stringify((event as CustomEvent).detail) + '\n'))
          controller.close()
        }
        window.addEventListener('finish-generation', finish, { once: true })
        init?.signal?.addEventListener('abort', () => {
          window.removeEventListener('finish-generation', finish)
          controller.error(new DOMException('Aborted', 'AbortError'))
        }, { once: true })
      } })
      return new Response(body, { headers: { 'content-type': 'application/x-ndjson' } })
    }
  })
  await page.goto('/generate')
  await page.getByLabel('What are you naming?', { exact: true }).fill('A friendly neighbourhood bakery')
  await page.getByRole('button', { name: 'Generate ideas', exact: true }).click()
  await expect(page.getByText('Three names checked.', { exact: true })).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'Main', exact: true })
  await nav.getByRole('link', { name: /Saved/ }).click()
  await expect(page).toHaveURL(/\/saved/)
  await nav.getByRole('link', { name: /Ideas|Generate/ }).click()
  await expect(page).toHaveURL(/\/generate/)
  await expect(page.getByText('Three names checked.', { exact: true })).toBeVisible()
  await nav.getByRole('link', { name: /Saved/ }).click()
  await expect(page).toHaveURL(/\/saved/)
  const candidates = ['Sunday', 'Crumb', 'Early Bird', 'Mallow'].map((name, index) => ({ name, rank: index + 1, score: 85, coverage: 80, verdict: 'strong', groups: [], strengths: [], weaknesses: [], caps: [] }))
  await page.evaluate(candidates => window.dispatchEvent(new CustomEvent('finish-generation', { detail: { type: 'result', ranked: { candidates, winner: null, winnerReason: '', tooCloseToCall: true } } })), candidates)
  await nav.getByRole('link', { name: /Ideas|Generate/ }).click()
  await expect(page.getByRole('heading', { name: 'Four names to consider' })).toBeVisible()
  await expect(page.locator('article')).toHaveCount(4)
  await page.getByRole('button', { name: 'Edit your brief' }).click()
  await expect(page.getByLabel('What are you naming?', { exact: true })).toHaveValue('A friendly neighbourhood bakery')
})

test('a search draft survives visiting Saved names', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Name to check').fill('Stay4Credits')
  await page.getByRole('button', { name: 'Deep Research', exact: true }).click()
  const nav = page.getByRole('navigation', { name: 'Main', exact: true })
  await nav.getByRole('link', { name: /Saved/ }).click()
  await expect(page).toHaveURL(/\/saved/)
  await nav.getByRole('link', { name: /Search/ }).click()
  await expect(page.getByLabel('Name to check')).toHaveValue('Stay4Credits')
  await expect(page.getByRole('button', { name: 'Deep Research', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('a finished scan is restored through Search with its score and evidence', async ({ page }) => {
  let requests = 0
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  const at = new Date().toISOString()
  const results = ['app_store', 'play_store', 'web', 'domain', 'x_twitter'].map(source => ({ source, status: source === 'x_twitter' ? 'confirmed_conflict' : 'no_conflict', confidence: 90, exactMatches: source === 'x_twitter' ? [{ externalId: 'x:stay4credits', name: 'Stay4Credits', categories: [], severity: 'high', similarity: { text: 100, phonetic: 100, visual: 100, overall: 100 }, evidence: [] }] : [], similarMatches: [], evidence: [], checkedAt: at, expiresAt: at, fromCache: false }))
  await page.route('**/api/scan', async route => {
    requests++
    await pending
    await route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'complete', summary: { results, viability: { score: 96, rawScore: 96, caps: [], conflicts: [{ source: 'x_twitter', name: 'Stay4Credits' }], groups: [], scoringVersion: 5 }, coverage: 80 } }) + '\n' })
  })
  try {
    await page.goto('/n/Stay4Credits?as=mobile_app')
    await expect.poll(() => requests).toBe(1)
    const nav = page.getByRole('navigation', { name: 'Main', exact: true })
    await nav.getByRole('link', { name: /Saved/ }).click()
    await expect(page).toHaveURL(/\/saved/)
    release()
    await nav.getByRole('link', { name: /Search/ }).click()
    await expect(page).toHaveURL(/\/n\/Stay4Credits\?as=mobile_app/)
    await expect(page.getByText('96', { exact: true }).first()).toBeVisible()
    await expect(page.getByText(/Stay4Credits.*already used on X/)).toBeVisible()
    expect(requests).toBe(1)
  } finally { release() }
})
