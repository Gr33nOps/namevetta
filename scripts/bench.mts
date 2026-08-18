/**
 * Quality benchmark CLI.
 *
 * Runs the golden dataset and prints the report. Exits non-zero on any false
 * negative, so it can gate CI: missing a real conflict is the failure §54 calls
 * most important, and it should never merge quietly.
 */
import { formatReport, runBenchmark } from '../golden/runner'
import { GOLDEN_CASES } from '../golden/index'

const report = runBenchmark(GOLDEN_CASES)
console.log(formatReport(report))

if (report.falseNegatives.length > 0) {
  console.error(`FAILED: ${report.falseNegatives.length} missed conflict(s).`)
  process.exit(1)
}
if (report.falsePositives.length > 0) {
  console.error(`FAILED: ${report.falsePositives.length} false alarm(s).`)
  process.exit(1)
}
