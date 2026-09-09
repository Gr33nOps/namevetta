/**
 * CPAN check, via the MetaCPAN API.
 *
 * This source was reporting a confirmed conflict for **every name on every
 * scan**, and had been for as long as it existed. The old probe asked
 * `metacpan.org/pod/{name}`, which is the human web application: it answers
 * `200 OK` with a single-page-app shell whatever you ask it for, and only
 * decides there is no such module once JavaScript has run in a browser. A
 * status-code probe against it can only ever say "taken". A comment in the
 * file claimed metacpan answered 402 for an unknown module; it does not, and
 * nothing had checked.
 *
 * The fix is to ask the API instead of the website. `fastapi.metacpan.org`
 * answers a real 404 for a distribution nobody has published, verified against
 * both a known-taken name (`Moose`) and names known not to exist.
 *
 * It is queried through the search endpoint rather than `/distribution/{name}`
 * because the direct route is **case-sensitive** — `/distribution/moose` is a
 * 404 while `/distribution/Moose` is a 200 — and `normalize()` lowercases
 * before we ever get here. Probing the case-sensitive route would have swapped
 * one systematic lie for its exact opposite: every name free instead of every
 * name taken. `distribution.lowercase` is the case-folded field, and it also
 * hands back the real spelling for the evidence line.
 */
import type { AdapterDeps, SourceAdapter } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import type { Evidence, Match, SourceResult } from '@/lib/core/types'
import { requestJson } from '@/lib/sources/http'
import { buildResult, makeEvidence, statusFromMatches, unverifiable } from '@/lib/sources/result'
import { normalize } from '@/lib/similarity/normalize'
import { compareNames } from '@/lib/similarity/score'

const API = 'https://fastapi.metacpan.org/v1'

interface SearchResponse {
  hits?: {
    /** Elasticsearch reports this as a bare number on this deployment. */
    total?: number | { value?: number }
    hits?: { _source?: { distribution?: string } }[]
  }
}

function totalOf(data: SearchResponse | undefined): number | undefined {
  const total = data?.hits?.total
  if (typeof total === 'number') return total
  if (typeof total === 'object' && typeof total.value === 'number') return total.value
  return undefined
}

/** The distribution page a person would open. */
const page = (name: string): string =>
  `https://metacpan.org/dist/${encodeURIComponent(name)}`

export const cpanAdapter: SourceAdapter = {
  id: 'cpan',

  async run(ctx: ScanContext, deps: AdapterDeps): Promise<SourceResult> {
    const name = normalize(ctx.name)
    if (name.length === 0) {
      return unverifiable('cpan', 'INVALID_NAME', 'Name contains no usable characters', false)
    }

    let data: SearchResponse | undefined
    try {
      const query = `distribution.lowercase:${JSON.stringify(name)}`
      const response = await requestJson<SearchResponse>(
        `${API}/release/_search?q=${encodeURIComponent(query)}&size=1`,
        { signal: deps.signal, retries: 1 },
      )
      data = response.data
    } catch {
      return unverifiable('cpan', 'LOOKUP_FAILED', 'CPAN could not be reached.', true)
    }

    const total = totalOf(data)
    if (total === undefined) {
      // A response we cannot read is an absence of information, never a free
      // name. This is the branch the old adapter did not have.
      return unverifiable(
        'cpan',
        'MALFORMED_RESPONSE',
        'CPAN returned a response we could not read.',
        true,
      )
    }

    const evidence: Evidence[] = []
    const exactMatches: Match[] = []

    if (total > 0) {
      // The real spelling, so the evidence says "Data-Dumper" and not the
      // lowercased form the user typed.
      const actual = data?.hits?.hits?.[0]?._source?.distribution ?? name
      const url = page(actual)
      exactMatches.push({
        externalId: `cpan:${actual}`,
        name: actual,
        categories: ['perl distribution'],
        url,
        similarity: compareNames(ctx.name, actual),
        severity: 'high',
        evidence: [makeEvidence('cpan', `"${actual}" is published on CPAN`, url)],
      })
    } else {
      evidence.push(
        makeEvidence('cpan', `No CPAN distribution named "${name}"`, page(name)),
      )
    }

    evidence.push(
      makeEvidence(
        'cpan',
        'CPAN is checked by exact distribution name only, ignoring case. A similar name would not be found here.',
      ),
    )

    deps.log('cpan.checked', { taken: total > 0 })

    return buildResult({
      source: 'cpan',
      status: statusFromMatches(exactMatches, []),
      exactMatches,
      evidence,
    })
  },
}
