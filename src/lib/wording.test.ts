import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FORBIDDEN_PHRASES } from '@/lib/presentation'

/**
 * A source-level guard on the wording rules.
 *
 * The forbidden phrases each assert a legal conclusion the product cannot
 * reach. Documenting that in a style guide is not enough — a reasonable-looking
 * copy edit six months from now would reintroduce "trademark cleared" without
 * anyone noticing. This test makes that a build failure.
 */

const SRC = join(process.cwd(), 'src')

/**
 * Test files are excluded deliberately. The rule governs what a *user* reads,
 * and a test that asserts "this phrase never appears" must be able to name the
 * phrase. Scanning tests would make the guard flag its own enforcement.
 */
function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      sourceFiles(full, acc)
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      acc.push(full)
    }
  }
  return acc
}

/** The declaration list is the one legitimate mention in non-test source. */
const ALLOWED_FILES = ['presentation.ts']

describe('forbidden wording', () => {
  const files = sourceFiles(SRC).filter(
    (f) => !ALLOWED_FILES.some((allowed) => f.endsWith(allowed)),
  )

  it('finds source files to scan', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  for (const phrase of FORBIDDEN_PHRASES) {
    it(`never uses "${phrase}"`, () => {
      const offenders = files.filter((file) =>
        readFileSync(file, 'utf8').toLowerCase().includes(phrase.toLowerCase()),
      )
      expect(offenders, `"${phrase}" must not appear in user-facing text`).toEqual([])
    })
  }

  it('never describes a name as simply "available"', () => {
    // §2: there is no `available` status, and the word must not sneak back in
    // through copy either. "No registration found" is the sanctioned phrasing.
    const offenders: string[] = []
    for (const file of files) {
      const content = readFileSync(file, 'utf8')
      if (/\b(?:is|are)\s+available\b/i.test(content)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })
})

describe('trademark scope statements', () => {
  it('states plainly that trademark clearance is not included', async () => {
    const { SCOPE_NOTICE, TRADEMARK_DISCLAIMER } = await import('@/lib/presentation')
    expect(SCOPE_NOTICE.toLowerCase()).toContain('not included')
    expect(TRADEMARK_DISCLAIMER.toLowerCase()).toContain('not legal clearance')
  })

  it('describes a clean preliminary screen without implying clearance', async () => {
    const { TRADEMARK_CLEAR_PHRASING } = await import('@/lib/presentation')
    expect(TRADEMARK_CLEAR_PHRASING.toLowerCase()).toContain('preliminary')
    expect(TRADEMARK_CLEAR_PHRASING.toLowerCase()).not.toContain('cleared')
  })
})
