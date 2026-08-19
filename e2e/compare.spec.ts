import { expect, test } from '@playwright/test'

/**
 * A canned `/api/compare` result.
 *
 * The comparison grid is the densest view in the product and is built from
 * CSS-grid divs rather than a `<table>`, because the column count is dynamic.
 * That makes its ARIA roles the only thing telling a screen reader which score
 * belongs to which name, so they need a test that actually renders them.
 *
 * Stubbed rather than run for real: a live comparison spends quota and hits
 * every upstream source twice. What the ranking itself produces is covered by
 * `src/lib/compare/compare.test.ts`.
 */
const COMPARISON = {
  candidates: [
    {
      name: 'northbeam',
      rank: 1,
      score: 78,
      coverage: 92,
      verdict: 'strong',
      groups: [
        { group: 'digital', label: 'Digital presence', subscore: 80 },
        { group: 'legal', label: 'Company registers', subscore: null },
      ],
      strengths: ['Digital presence'],
      weaknesses: [],
      caps: [],
    },
    {
      name: 'vaultara',
      rank: 2,
      score: 51,
      coverage: 88,
      verdict: 'mixed',
      groups: [
        { group: 'digital', label: 'Digital presence', subscore: 45 },
        { group: 'legal', label: 'Company registers', subscore: 60 },
      ],
      strengths: [],
      weaknesses: ['Digital presence'],
      caps: [],
    },
  ],
  winner: 'northbeam',
  winnerReason: 'northbeam leads on digital presence.',
  coverageWarning: undefined,
  tooCloseToCall: false,
}

test('the comparison grid exposes real table semantics', async ({ page }) => {
  await page.route('**/api/compare', async (route) => {
    const events = [
      { type: 'started', names: ['northbeam', 'vaultara'] },
      { type: 'comparison', result: COMPARISON },
    ]
    await route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: events.map((e) => JSON.stringify(e)).join('\n') + '\n',
    })
  })

  await page.goto('/compare')
  await page.getByLabel('Candidate name 1').fill('northbeam')
  await page.getByLabel('Candidate name 2').fill('vaultara')
  await page.getByRole('button', { name: /^Compare/ }).click()

  const table = page.getByRole('table')
  await expect(table).toBeVisible()

  // A column per candidate, plus the metric column they are measured against.
  await expect(table.getByRole('columnheader')).toHaveCount(3)
  await expect(table.getByRole('columnheader', { name: /northbeam/ })).toBeVisible()

  // Every metric row announces what it is measuring.
  await expect(table.getByRole('rowheader', { name: 'Digital Viability' })).toBeVisible()
  await expect(table.getByRole('rowheader', { name: 'Research coverage' })).toBeVisible()

  // A group with no usable answer shows an en dash, which reads as nothing at
  // all out loud. The text alternative is what makes it mean "not checked"
  // rather than "zero".
  await expect(table.getByText('Not checked')).toHaveCount(1)

  // The scroll container must be reachable by keyboard, or its overflow is
  // unreadable without a mouse.
  await expect(page.getByRole('region', { name: /Comparison of every candidate/ })).toHaveAttribute(
    'tabindex',
    '0',
  )
})
