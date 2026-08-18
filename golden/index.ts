import { CLEAR_CASES } from './cases-clear'
import { CONFLICT_CASES } from './cases-conflicts'
import { CROSS_CATEGORY_CASES, SOURCE_SHAPED_CASES } from './cases-categories'
import type { GoldenCase } from './types'

/**
 * The full golden dataset.
 *
 * §54 asks for at least 200 names before launch and 500+ eventually. This is
 * the working set: every case is hand-labelled, and each carries a note saying
 * why it is here so a future failure can be judged rather than merely silenced.
 */
export const GOLDEN_CASES: GoldenCase[] = [
  ...CONFLICT_CASES,
  ...CLEAR_CASES,
  ...CROSS_CATEGORY_CASES,
  ...SOURCE_SHAPED_CASES,
]

export { CLEAR_CASES, CONFLICT_CASES, CROSS_CATEGORY_CASES, SOURCE_SHAPED_CASES }
export * from './runner'
export * from './types'
