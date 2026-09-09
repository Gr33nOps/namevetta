/**
 * RubyGems registry check.
 *
 * Same shape as `npm`: an exact document lookup and a real search endpoint.
 * The exact-lookup endpoint's 404 is `text/plain` ("This rubygem could not be
 * found."), confirmed live rather than assumed — `requestJson` would try to
 * `JSON.parse` that and throw, so the exact check uses the raw `request` and
 * only parses once the status confirms a JSON body. The search endpoint
 * always returns a JSON array, including an empty one, so it keeps using
 * `requestJson` directly.
 */
import type { AdapterDeps, SourceAdapter } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import type { Evidence, Match, SourceResult } from '@/lib/core/types'
import { request, requestJson, SourceRequestError } from '@/lib/sources/http'
import { buildResult, makeEvidence, statusFromMatches, unverifiable } from '@/lib/sources/result'
import { severityFor } from '@/lib/sources/severity'
import { normalize } from '@/lib/similarity/normalize'
import { compareNames } from '@/lib/similarity/score'

const API = 'https://rubygems.org/api/v1'

interface GemDoc {
  name: string
  info?: string
  homepage_uri?: string | null
  authors?: string
}

export const rubygemsAdapter: SourceAdapter = {
  id: 'rubygems',

  async run(ctx: ScanContext, deps: AdapterDeps): Promise<SourceResult> {
    const pkg = normalize(ctx.name)
    if (pkg.length === 0) {
      return unverifiable('rubygems', 'INVALID_NAME', 'Name contains no usable characters', false)
    }

    const evidence: Evidence[] = []
    const exactMatches: Match[] = []
    const similarMatches: Match[] = []

    try {
      const response = await request(`${API}/gems/${encodeURIComponent(pkg)}.json`, {
        signal: deps.signal,
        expectedStatuses: [404],
      })

      if (response.status === 404) {
        evidence.push(makeEvidence('rubygems', `Gem name "${pkg}" is unpublished`))
      } else {
        let data: GemDoc
        try {
          data = JSON.parse(response.text) as GemDoc
        } catch {
          throw new SourceRequestError('BAD_JSON', 'RubyGems returned malformed JSON', false, response.status)
        }
        const url = `https://rubygems.org/gems/${data.name}`
        exactMatches.push({
          externalId: data.name,
          name: data.name,
          categories: ['rubygems'],
          active: true,
          url,
          similarity: compareNames(ctx.name, data.name),
          severity: 'high',
          evidence: [makeEvidence('rubygems', `Gem "${data.name}" is published`, url)],
          ...(data.info === undefined || data.info === '' ? {} : { description: data.info }),
          ...(data.authors === undefined ? {} : { owner: data.authors }),
        })
      }
    } catch (cause) {
      const err = cause instanceof SourceRequestError ? cause : undefined
      return unverifiable(
        'rubygems',
        err?.code ?? 'LOOKUP_FAILED',
        'RubyGems could not be reached.',
        true,
      )
    }

    try {
      const { data } = await requestJson<GemDoc[]>(
        `${API}/search.json?query=${encodeURIComponent(pkg)}`,
        { signal: deps.signal, expectedStatuses: [404] },
      )

      for (const found of data ?? []) {
        if (normalize(found.name) === pkg) continue

        const similarity = compareNames(ctx.name, found.name)
        if (similarity.overall < 65) continue

        const url = `https://rubygems.org/gems/${found.name}`
        similarMatches.push({
          externalId: found.name,
          name: found.name,
          categories: ['rubygems'],
          active: true,
          url,
          similarity,
          severity: severityFor(similarity),
          evidence: [makeEvidence('rubygems', `Similar gem "${found.name}"`, url)],
          ...(found.info === undefined || found.info === '' ? {} : { description: found.info }),
        })
        // RubyGems search returns a great many loosely-related hits; twenty is
        // enough to catch the close ones without turning every scan into a
        // long tail of noise.
        if (similarMatches.length >= 20) break
      }
      evidence.push(makeEvidence('rubygems', `Searched the registry for names similar to "${pkg}"`))
    } catch {
      evidence.push(
        makeEvidence('rubygems', 'Similar-gem search did not complete; exact result above still applies'),
      )
    }

    deps.log('rubygems.checked', { exact: exactMatches.length, similar: similarMatches.length })

    return buildResult({
      source: 'rubygems',
      status: statusFromMatches(exactMatches, similarMatches),
      exactMatches,
      similarMatches,
      evidence,
    })
  },
}
