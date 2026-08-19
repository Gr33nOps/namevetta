import { expect, test } from '@playwright/test'

/**
 * A completed scan, stubbed.
 *
 * Running one for real spends a check and calls every upstream source. What is
 * under test here is the report shell, not the research, which
 * `src/lib/scoring/**` and `golden/**` cover far more thoroughly.
 */
const SUMMARY = {
  results: [],
  viability: { score: 72, rawScore: 72, caps: [], groups: [], scoringVersion: 3 },
  coverage: 0,
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/scan', async (route) => {
    const events = [
      { type: 'started' },
      { type: 'complete', summary: SUMMARY },
    ]
    await route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: events.map((e) => JSON.stringify(e)).join('\n') + '\n',
    })
  })
})

test('a report offers a way to say it got something wrong', async ({ page }) => {
  await page.goto('/scan?name=northbeam&category=saas&type=quick')

  const feedback = page.getByRole('link', { name: 'Tell us what it got wrong' })
  await expect(feedback).toBeVisible()

  const href = await feedback.getAttribute('href')
  expect(href).toContain('github.com/Gr33nOps/NameVetta/issues/new')

  // The scoring version travels, because it is the one fact that makes a
  // complaint about a score reproducible.
  expect(href).toContain('scoring%203')

  // Nothing about the search does. A user clicking this out of curiosity must
  // not land on a public form pre-filled with the name they are considering.
  expect(href).not.toContain('northbeam')
  expect(href).not.toContain('saas')

  // It leaves the site, so it must not hand the opener over with it.
  await expect(feedback).toHaveAttribute('target', '_blank')
  expect(await feedback.getAttribute('rel')).toContain('noopener')
})

test('the feedback link is left out of a printed report', async ({ page }) => {
  await page.goto('/scan?name=northbeam&category=saas&type=quick')
  await expect(page.getByRole('link', { name: 'Tell us what it got wrong' })).toBeVisible()

  // "Next steps" is interactive chrome. On paper it is a dead link and a row
  // of buttons nobody can press.
  await page.emulateMedia({ media: 'print' })
  await expect(page.getByRole('link', { name: 'Tell us what it got wrong' })).toBeHidden()
})
