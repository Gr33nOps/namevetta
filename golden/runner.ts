/**
 * Golden dataset runner.
 *
 * Drives cases through the **real** engine — the same `classifyScan`,
 * `compareNames`, `industryRelevance` and `severityFor` the product uses. A
 * benchmark that reimplemented any of that would measure the reimplementation.
 *
 * No network, no fixtures, no clock. Every case is pure computation, so the
 * suite runs in milliseconds and can gate CI without flaking.
 */
import { classifyMatch, classifyScan } from '@/lib/industry/classify'
import { industryRelevance } from '@/lib/industry/relevance'
import { severityFor } from '@/lib/sources/severity'
import { compareNames, containsNameAsWord, leadsWithName } from '@/lib/similarity/score'
import {
  SEVERITY_RANK,
  type BenchmarkReport,
  type CaseFailure,
  type CaseOutcome,
  type GoldenCase,
} from './types'

/** Run one case through the engine and check it against its expectations. */
export function evaluateCase(testCase: GoldenCase): CaseOutcome {
  const scan = classifyScan(testCase.category, testCase.description)
  const matchClassification = classifyMatch({
    description: testCase.matchDescription,
    categories: testCase.matchCategories ?? [],
  })

  const industry = industryRelevance(scan, matchClassification)
  const similarity = compareNames(
    testCase.candidate,
    testCase.match,
    industry === undefined ? {} : { industry },
  )
  const severity = severityFor(similarity, {
    active: testCase.active ?? true,
    legallyWeighted: testCase.legallyWeighted ?? false,
    // Mirrors `enrichMatch`. If the benchmark computed severity differently
    // from the product, it would be measuring something the product never does.
    contained: containsNameAsWord(testCase.candidate, testCase.match),
    leading: leadsWithName(testCase.candidate, testCase.match),
  })

  const e = testCase.expect
  const failures: CaseFailure[] = []

  const check = (
    field: string,
    actual: number | undefined,
    min: number | undefined,
    max: number | undefined,
  ): void => {
    if (actual === undefined) {
      if (min !== undefined) {
        failures.push({ field, expected: `>= ${min}`, actual: 'undefined' })
      }
      return
    }
    if (min !== undefined && actual < min) {
      failures.push({ field, expected: `>= ${min}`, actual: String(actual) })
    }
    if (max !== undefined && actual > max) {
      failures.push({ field, expected: `<= ${max}`, actual: String(actual) })
    }
  }

  check('overall', similarity.overall, e.minOverall, e.maxOverall)
  check('phonetic', similarity.phonetic, e.minPhonetic, e.maxPhonetic)
  check('text', similarity.text, e.minText, e.maxText)

  if (e.industryUnknown === true) {
    if (industry !== undefined) {
      failures.push({ field: 'industry', expected: 'unknown', actual: String(industry) })
    }
  } else {
    check('industry', industry, e.minIndustry, e.maxIndustry)
  }

  if (e.severityAtLeast !== undefined) {
    if (SEVERITY_RANK[severity] < SEVERITY_RANK[e.severityAtLeast]) {
      failures.push({ field: 'severity', expected: `>= ${e.severityAtLeast}`, actual: severity })
    }
  }
  if (e.severityAtMost !== undefined) {
    if (SEVERITY_RANK[severity] > SEVERITY_RANK[e.severityAtMost]) {
      failures.push({ field: 'severity', expected: `<= ${e.severityAtMost}`, actual: severity })
    }
  }

  const passed = failures.length === 0

  // A severity failure on a conflict case means we under-detected a real
  // problem. That is the false negative §54 cares most about; a similarity
  // range drifting is a different, lesser kind of failure.
  const severityFailed = failures.some((f) => f.field === 'severity')
  const underDetected = failures.some(
    (f) => f.field === 'severity' && f.expected.startsWith('>='),
  )
  const overDetected = failures.some(
    (f) => f.field === 'severity' && f.expected.startsWith('<='),
  )

  return {
    case: testCase,
    passed,
    failures,
    falseNegative: testCase.kind === 'conflict' && severityFailed && underDetected,
    falsePositive: testCase.kind === 'clear' && severityFailed && overDetected,
  }
}

/** Run the whole dataset and summarise it. */
export function runBenchmark(cases: readonly GoldenCase[]): BenchmarkReport {
  const outcomes = cases.map(evaluateCase)

  const byTag: Record<string, { total: number; passed: number }> = {}
  for (const outcome of outcomes) {
    for (const tag of outcome.case.tags) {
      const bucket = byTag[tag] ?? { total: 0, passed: 0 }
      bucket.total += 1
      if (outcome.passed) bucket.passed += 1
      byTag[tag] = bucket
    }
  }

  const failed = outcomes.filter((o) => !o.passed)

  return {
    total: outcomes.length,
    passed: outcomes.length - failed.length,
    failed: failed.length,
    falseNegatives: failed.filter((o) => o.falseNegative),
    falsePositives: failed.filter((o) => o.falsePositive),
    otherFailures: failed.filter((o) => !o.falseNegative && !o.falsePositive),
    byTag,
  }
}

/** Human-readable report for the CLI. */
export function formatReport(report: BenchmarkReport): string {
  const lines: string[] = []
  const pct = (n: number, d: number): string =>
    d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`

  lines.push('')
  lines.push('  NameVetta quality benchmark')
  lines.push('  ' + '─'.repeat(58))
  lines.push(`  Cases            ${report.total}`)
  lines.push(`  Passed           ${report.passed}  (${pct(report.passed, report.total)})`)
  lines.push(`  Failed           ${report.failed}`)
  lines.push('')
  lines.push(`  False negatives  ${report.falseNegatives.length}   <- missed real conflicts`)
  lines.push(`  False positives  ${report.falsePositives.length}   <- flagged things that were fine`)
  lines.push(`  Range drift      ${report.otherFailures.length}`)

  if (report.falseNegatives.length > 0) {
    lines.push('')
    lines.push('  MISSED CONFLICTS')
    for (const o of report.falseNegatives) {
      lines.push(`   × ${o.case.id}: "${o.case.candidate}" vs "${o.case.match}"`)
      for (const f of o.failures) lines.push(`       ${f.field}: expected ${f.expected}, got ${f.actual}`)
      lines.push(`       ${o.case.note}`)
    }
  }

  if (report.falsePositives.length > 0) {
    lines.push('')
    lines.push('  FALSE ALARMS')
    for (const o of report.falsePositives) {
      lines.push(`   × ${o.case.id}: "${o.case.candidate}" vs "${o.case.match}"`)
      for (const f of o.failures) lines.push(`       ${f.field}: expected ${f.expected}, got ${f.actual}`)
      lines.push(`       ${o.case.note}`)
    }
  }

  if (report.otherFailures.length > 0) {
    lines.push('')
    lines.push('  RANGE DRIFT (not a detection failure)')
    for (const o of report.otherFailures) {
      lines.push(`   · ${o.case.id}: "${o.case.candidate}" vs "${o.case.match}"`)
      for (const f of o.failures) lines.push(`       ${f.field}: expected ${f.expected}, got ${f.actual}`)
    }
  }

  lines.push('')
  lines.push('  BY CATEGORY')
  for (const [tag, stats] of Object.entries(report.byTag).sort()) {
    const bar = stats.passed === stats.total ? 'ok  ' : 'FAIL'
    lines.push(`   ${bar} ${tag.padEnd(24)} ${stats.passed}/${stats.total}`)
  }
  lines.push('')

  return lines.join('\n')
}
