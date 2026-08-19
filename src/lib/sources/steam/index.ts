/**
 * Steam store check.
 *
 * The store search endpoint is public, unauthenticated and returns JSON, which
 * makes it the one games marketplace that can be checked properly. It answers
 * with matching titles rather than a namespace: Steam lets two games share a
 * name, so "taken" here means "a game with this name is on sale", which is the
 * thing that actually matters when naming one.
 */
import type { AdapterDeps, SourceAdapter } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import type { Evidence, Match, SourceResult } from '@/lib/core/types'
import { requestJson } from '@/lib/sources/http'
import { buildResult, makeEvidence, statusFromMatches, unverifiable } from '@/lib/sources/result'
import { severityFor } from '@/lib/sources/severity'
import { normalize } from '@/lib/similarity/normalize'
import { compareNames } from '@/lib/similarity/score'

/** Below this a search hit is noise rather than a naming concern. */
const SIMILARITY_FLOOR = 65

interface Item {
  id?: number
  name?: string
  type?: string
}

export const steamAdapter: SourceAdapter = {
  id: 'steam',

  async run(ctx: ScanContext, deps: AdapterDeps): Promise<SourceResult> {
    const name = normalize(ctx.name)
    if (name.length === 0) {
      return unverifiable('steam', 'INVALID_NAME', 'Name contains no usable characters', false)
    }

    let items: Item[]
    try {
      const { data } = await requestJson<{ items?: Item[] }>(
        `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(ctx.name)}&cc=us&l=en`,
        { signal: deps.signal, retries: 1 },
      )
      items = data?.items ?? []
    } catch {
      return unverifiable('steam', 'LOOKUP_FAILED', 'Steam could not be reached.', true)
    }

    const exactMatches: Match[] = []
    const similarMatches: Match[] = []

    for (const item of items) {
      if (item.name === undefined || item.id === undefined) continue
      const similarity = compareNames(ctx.name, item.name)
      if (similarity.overall < SIMILARITY_FLOOR) continue

      const url = `https://store.steampowered.com/app/${item.id}`
      const match: Match = {
        externalId: String(item.id),
        name: item.name,
        categories: [item.type ?? 'game'],
        url,
        similarity,
        severity: severityFor(similarity),
        evidence: [makeEvidence('steam', `"${item.name}" is on Steam`, url)],
      }

      if (normalize(item.name) === name) exactMatches.push(match)
      else similarMatches.push(match)
    }

    const evidence: Evidence[] = [
      makeEvidence('steam', `Searched the Steam store and read ${items.length} results`),
    ]
    if (exactMatches.length === 0 && similarMatches.length === 0) {
      evidence.push(makeEvidence('steam', `No Steam title matching "${ctx.name}"`))
    }

    deps.log('steam.checked', { items: items.length, similar: similarMatches.length })

    return buildResult({
      source: 'steam',
      status: statusFromMatches(exactMatches, similarMatches),
      exactMatches,
      similarMatches,
      evidence,
    })
  },
}
