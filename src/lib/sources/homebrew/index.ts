/**
 * Homebrew formula check.
 *
 * formulae.brew.sh is a static JSON API with an exact lookup and no search
 * endpoint — the full formula index is an ~18 MB file, too large to fetch on
 * every scan just to search it. So, like PyPI, this probes the exact name plus
 * its highest-weight spelling variants rather than querying a search service.
 *
 * It is served from GitHub Pages, which matters for one concrete reason: a
 * missing formula returns GitHub's generic HTML "page not found" document, not
 * a JSON 404 — observed live, not assumed. `requestJson` would try to
 * `JSON.parse` that HTML and throw, so this uses the raw `request` and only
 * parses the body once the status confirms there is JSON to parse.
 */
import type { AdapterDeps, SourceAdapter } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import type { Evidence, Match, SourceResult } from '@/lib/core/types'
import { request, SourceRequestError } from '@/lib/sources/http'
import { buildResult, makeEvidence, statusFromMatches, unverifiable } from '@/lib/sources/result'
import { severityFor } from '@/lib/sources/severity'
import { normalize } from '@/lib/similarity/normalize'
import { compareNames } from '@/lib/similarity/score'
import { generateVariants } from '@/lib/similarity/variants'

const API = 'https://formulae.brew.sh/api/formula'

/** How many variants to probe. Each is one request against a shared quota. */
const VARIANT_PROBE_LIMIT = 8

interface FormulaDoc {
  name: string
  desc?: string | null
  disabled?: boolean
}

async function lookup(name: string, signal: AbortSignal): Promise<FormulaDoc | undefined> {
  const response = await request(`${API}/${encodeURIComponent(name)}.json`, {
    signal,
    expectedStatuses: [404],
    retries: 1,
  })
  if (response.status === 404) return undefined
  try {
    return JSON.parse(response.text) as FormulaDoc
  } catch {
    throw new SourceRequestError('BAD_JSON', 'Homebrew returned malformed JSON', false, response.status)
  }
}

export const homebrewAdapter: SourceAdapter = {
  id: 'homebrew',

  async run(ctx: ScanContext, deps: AdapterDeps): Promise<SourceResult> {
    const pkg = normalize(ctx.name)
    if (pkg.length === 0) {
      return unverifiable('homebrew', 'INVALID_NAME', 'Name contains no usable characters', false)
    }

    const evidence: Evidence[] = []
    const exactMatches: Match[] = []
    const similarMatches: Match[] = []

    try {
      const formula = await lookup(pkg, deps.signal)
      if (formula === undefined) {
        evidence.push(makeEvidence('homebrew', `No Homebrew formula named "${pkg}"`))
      } else {
        const url = `https://formulae.brew.sh/formula/${formula.name}`
        exactMatches.push({
          externalId: formula.name,
          name: formula.name,
          categories: ['homebrew'],
          active: formula.disabled !== true,
          url,
          similarity: compareNames(ctx.name, formula.name),
          severity: 'high',
          evidence: [makeEvidence('homebrew', `Formula "${formula.name}" is published`, url)],
          ...(formula.desc === null || formula.desc === undefined ? {} : { description: formula.desc }),
        })
      }
    } catch (cause) {
      const err = cause instanceof SourceRequestError ? cause : undefined
      return unverifiable(
        'homebrew',
        err?.code ?? 'LOOKUP_FAILED',
        'Homebrew could not be reached.',
        true,
      )
    }

    const variants = generateVariants(ctx.name, VARIANT_PROBE_LIMIT + 1)
      .filter((v) => v.value !== pkg)
      .slice(0, VARIANT_PROBE_LIMIT)

    const probes = await Promise.allSettled(
      variants.map(async (variant) => ({
        variant: variant.value,
        formula: await lookup(variant.value, deps.signal),
      })),
    )

    for (const probe of probes) {
      if (probe.status !== 'fulfilled' || probe.value.formula === undefined) continue
      const formula = probe.value.formula
      const similarity = compareNames(ctx.name, formula.name)
      const url = `https://formulae.brew.sh/formula/${formula.name}`

      similarMatches.push({
        externalId: formula.name,
        name: formula.name,
        categories: ['homebrew'],
        active: formula.disabled !== true,
        url,
        similarity,
        severity: severityFor(similarity, { active: formula.disabled !== true }),
        evidence: [makeEvidence('homebrew', `Similar formula "${formula.name}" is published`, url)],
        ...(formula.desc === null || formula.desc === undefined ? {} : { description: formula.desc }),
      })
    }

    evidence.push(
      makeEvidence('homebrew', `Probed ${variants.length} close spelling variants`),
      makeEvidence(
        'homebrew',
        'Homebrew has no public search API, so this checks the exact name and close variants rather than the full formula index.',
      ),
    )

    deps.log('homebrew.checked', { probed: variants.length, similar: similarMatches.length })

    return buildResult({
      source: 'homebrew',
      status: statusFromMatches(exactMatches, similarMatches),
      exactMatches,
      similarMatches,
      evidence,
    })
  },
}
