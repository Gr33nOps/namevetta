import { describe, expect, it } from 'vitest'
import { GOLDEN_CASES } from './index'
import { formatReport, runBenchmark } from './runner'

/**
 * The regression gate (§54).
 *
 * Every scoring and similarity change must pass this. False negatives fail the
 * build outright — missing a real conflict is how the product would actively
 * mislead somebody, and it must never merge quietly.
 */
describe('golden dataset', () => {
  const report = runBenchmark(GOLDEN_CASES)

  // Printed, not just asserted. The pass/fail gate below is what protects the
  // build, but the figures are what tell you whether a change made the engine
  // genuinely better or merely kept it inside the thresholds.
  it('reports its metrics', () => {
    console.log(`
${formatReport(report)}`)
    expect(report.total).toBe(GOLDEN_CASES.length)
  })

  it('has no duplicate case ids', () => {
    const ids = GOLDEN_CASES.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every case a note explaining why it exists', () => {
    for (const c of GOLDEN_CASES) {
      expect(c.note.length, `${c.id} needs a note`).toBeGreaterThan(20)
      expect(c.tags.length, `${c.id} needs tags`).toBeGreaterThan(0)
    }
  })

  it('covers both conflicts and clear cases in useful numbers', () => {
    const conflicts = GOLDEN_CASES.filter((c) => c.kind === 'conflict').length
    const clear = GOLDEN_CASES.filter((c) => c.kind === 'clear').length
    expect(conflicts).toBeGreaterThan(30)
    expect(clear).toBeGreaterThan(20)
  })

  it('misses no real conflicts', () => {
    const missed = report.falseNegatives.map(
      (o) => `${o.case.id} (${o.case.candidate} vs ${o.case.match}): ${o.failures.map((f) => `${f.field} expected ${f.expected} got ${f.actual}`).join('; ')}`,
    )
    expect(missed, 'false negatives are the most important failure').toEqual([])
  })

  it('raises no false alarms', () => {
    const alarms = report.falsePositives.map(
      (o) => `${o.case.id} (${o.case.candidate} vs ${o.case.match}): ${o.failures.map((f) => `${f.field} expected ${f.expected} got ${f.actual}`).join('; ')}`,
    )
    expect(alarms).toEqual([])
  })

  it('stays within its documented similarity ranges', () => {
    const drift = report.otherFailures.map(
      (o) => `${o.case.id}: ${o.failures.map((f) => `${f.field} expected ${f.expected} got ${f.actual}`).join('; ')}`,
    )
    expect(drift).toEqual([])
  })
})
