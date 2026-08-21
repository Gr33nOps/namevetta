/**
 * The numbers the site says out loud, checked against the numbers it runs on.
 *
 * A production audit found the homepage advertising "50 checks a day", the
 * auth page "25 Quick Checks and 5 Deep Research runs", and the history page
 * "74/75" — three different products, described by one codebase, none of them
 * matching the other two. Separately, three pages said "60 sources checked on
 * every search" while some sources were Deep-only and others were deliberately
 * not asked for the selected category.
 *
 * Both classes of bug have the same shape: a figure typed into a component
 * instead of imported from the thing that enforces it. So this file reads the
 * source of every user-facing file and fails on a literal that looks like a
 * quota or a source count. It is deliberately a lint rather than a render
 * test — a render test proves one page is right today, and this proves the
 * next page cannot be written wrong.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isCategoryDependent,
  activeSources,
  isActiveSource,
  manualSources,
  sourceCounts,
  SOURCE_MANIFEST,
} from '@/lib/core/adapter'
import {
  dailyAllowanceSentence,
  DEFAULT_QUOTA_LIMITS,
  quotaPhrase,
  QUOTA_KINDS,
} from '@/lib/core/quota'
import { SOURCE_IDS } from '@/lib/core/types'

const ROOT = join(process.cwd(), 'src')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      out.push(...walk(path))
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(path)
    }
  }
  return out
}

/** Files that render text a visitor reads. */
const USER_FACING = walk(ROOT).filter(
  (p) => p.includes(`${join('src', 'app')}`) || p.includes(`${join('src', 'components')}`),
)

/**
 * A file's rendered text, with its comments removed.
 *
 * The comments below every fix in this repository quote the wrong copy they
 * replaced, which is exactly what these patterns look for. Explaining a bug is
 * not committing it, so the scanner reads what ships, not what is documented.
 */
function read(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/* -------------------------------------------------------------------------- */
/* Quota                                                                      */
/* -------------------------------------------------------------------------- */

describe('quota copy', () => {
  it('has one configuration, and the environment defaults to it', async () => {
    const { resetEnvCache } = await import('@/lib/env')
    resetEnvCache()
    const { effectiveLimits } = await import('@/lib/quota')
    // With nothing set in the environment, the enforced limits must be the
    // documented ones. If these ever diverge, every sentence built from
    // `DEFAULT_QUOTA_LIMITS` becomes a lie on an unconfigured deployment.
    expect(effectiveLimits()).toEqual(DEFAULT_QUOTA_LIMITS)
  })

  it('gives an account more of everything than a guest', () => {
    for (const kind of QUOTA_KINDS) {
      expect(DEFAULT_QUOTA_LIMITS.user[kind]).toBeGreaterThan(DEFAULT_QUOTA_LIMITS.guest[kind])
    }
  })

  it('states the allowance in one grammatical shape', () => {
    expect(quotaPhrase('deep', 1)).toBe('1 Deep Research run')
    expect(quotaPhrase('deep', 5)).toBe('5 Deep Research runs')
    expect(dailyAllowanceSentence({ quick: 75, deep: 5, generate: 3 })).toBe(
      '75 Quick Checks and 5 Deep Research runs a day',
    )
  })

  /*
    The guard that would have caught the audit finding.

    A literal number immediately followed by a metered feature's name is a
    quota claim, and a quota claim belongs to `@/lib/core/quota`. Interpolated
    values (`{limits.user.quick} Quick Checks`) are unaffected — the pattern
    only matches digits.
  */
  it('never writes a quota figure into a component', () => {
    const claim = /\b\d+\s+(Quick Check|Deep Research|Quick Checks|checks a day|generation runs?)/i
    const offenders = USER_FACING.filter((p) => claim.test(read(p))).map((p) =>
      p.slice(ROOT.length + 1),
    )
    expect(offenders, 'import the limit from @/lib/core/quota instead').toEqual([])
  })
})

/* -------------------------------------------------------------------------- */
/* Source counts                                                              */
/* -------------------------------------------------------------------------- */

describe('source counts', () => {
  const counts = sourceCounts()

  it('counts the catalog as the manifest, and nothing else', () => {
    expect(counts.catalog).toBe(activeSources().length)
    expect(counts.catalog).toBeLessThan(Object.keys(SOURCE_MANIFEST).length)
  })

  it('keeps removed source IDs readable but inactive', () => {
    expect(isActiveSource('lastfm')).toBe(false)
    expect(isActiveSource('product_hunt')).toBe(false)
    expect(SOURCE_MANIFEST.lastfm).toBeDefined()
    expect(SOURCE_MANIFEST.product_hunt).toBeDefined()
  })

  it('keeps a Quick Check a strict subset of Deep Research', () => {
    expect(counts.quick).toBeLessThan(counts.deep)
    expect(counts.deep).toBeLessThanOrEqual(counts.catalog)
    expect(counts.deepOnly).toBe(counts.deep - counts.quick)
  })

  it('counts the manual sources as the ones that never assert automatically', () => {
    expect(counts.manual).toBe(manualSources().length)
    expect(counts.manual).toBeGreaterThan(0)
    for (const source of manualSources()) {
      expect(source.tosPosture).toBe('manual_only')
    }
  })

  it('keeps discovery sources separate from automatic availability checks', () => {
    expect(counts.discovery).toBeGreaterThan(0)
    for (const source of activeSources().filter((source) => source.resultMode === 'discovery')) {
      expect(source.tosPosture).not.toBe('manual_only')
    }
  })

  it('declares every category-dependent source', () => {
    expect(counts.categoryDependent).toBeGreaterThan(0)
    for (const id of SOURCE_IDS) {
      if (!isCategoryDependent(id)) continue
      // A source that decides for itself whether to run must still be in the
      // manifest, or the status page cannot describe it.
      expect(SOURCE_MANIFEST[id]).toBeDefined()
    }
  })

  /*
    "60 sources checked on every search" was true of neither scan type. Any
    literal in that range beside the word "sources" is almost certainly a
    hard-coded catalog or run-set size.
  */
  it('never writes a source count into a component', () => {
    const claim = /\b(4\d|5\d|6\d|7\d)\s+(sources|registries|networks|checks)\b/i
    const offenders = USER_FACING.filter((p) => claim.test(read(p))).map((p) =>
      p.slice(ROOT.length + 1),
    )
    expect(offenders, 'derive the count from sourceCounts() instead').toEqual([])
  })

  it('never claims the whole catalog runs on every search', () => {
    const overclaim = /checked on every search|all \d+ sources|every one of the \d+/i
    const offenders = USER_FACING.filter((p) => overclaim.test(read(p))).map((p) =>
      p.slice(ROOT.length + 1),
    )
    expect(offenders).toEqual([])
  })
})
