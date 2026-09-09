/**
 * The French national company register (Recherche d'Entreprises, INSEE/INPI
 * data via api.gouv.fr).
 *
 * Companies House was, until this, the only register this product checks —
 * and the only source with a *declared* industry code, which is what lets
 * `severityFor` reach beyond "high" for a same-name company. This is the same
 * kind of source for a second, much larger market: France reports a NAF (APE)
 * code on every registration, built on the same NACE Rev. 2 basis UK SIC uses
 * (see `industryForNaceDivision`), so the same escalation applies here.
 *
 * Free, no API key, no rate limit documented — a courtesy ceiling is set the
 * same way it is for every other source in that position.
 *
 * Scope, stated in the evidence so a clean result is never over-read: this
 * covers **companies registered in France**. It says nothing about a name
 * used anywhere else.
 */
import type { AdapterDeps, SourceAdapter } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import type { Evidence, Match, SourceResult } from '@/lib/core/types'
import { SOURCE_MANIFEST } from '@/lib/core/adapter'
import { industryForNaceDivision } from '@/lib/industry/sic'
import { requestJson, SourceRequestError } from '@/lib/sources/http'
import { RateLimitedError, throttledFetch } from '@/lib/sources/rate-limit'
import { buildResult, makeEvidence, statusFromMatches, unverifiable } from '@/lib/sources/result'
import { severityFor } from '@/lib/sources/severity'
import { normalize } from '@/lib/similarity/normalize'
import { compareNames, containsNameAsWord, leadsWithName } from '@/lib/similarity/score'

const API = 'https://recherche-entreprises.api.gouv.fr'

/** Below this, a hit that neither exactly matches nor contains the name is noise. */
const SIMILARITY_FLOOR = 72

interface Etablissement {
  libelle_commune?: string
}

interface CompanyItem {
  siren: string
  nom_complet?: string
  nom_raison_sociale?: string
  activite_principale?: string
  etat_administratif?: string
  date_creation?: string
  date_fermeture?: string
  siege?: Etablissement
}

interface SearchResponse {
  results?: CompanyItem[]
  total_results?: number
}

function isActive(status: string | undefined): boolean {
  // 'A' = active (actif), 'F' = closed (fermé, ceased).
  return status !== 'F'
}

export const frEntreprisesAdapter: SourceAdapter = {
  id: 'fr_entreprises',

  async run(ctx: ScanContext, deps: AdapterDeps): Promise<SourceResult> {
    const target = normalize(ctx.name)
    if (target.length === 0) {
      return unverifiable('fr_entreprises', 'INVALID_NAME', 'Name contains no usable characters', false)
    }

    const manifest = SOURCE_MANIFEST.fr_entreprises

    let data: SearchResponse | undefined
    let fromCache = false

    try {
      const result = await throttledFetch<SearchResponse | undefined>({
        source: 'fr_entreprises',
        cacheKey: `fr_entreprises:${target}`,
        ttlSeconds: manifest.cacheTtlSeconds,
        requestsPerMinute: manifest.rateLimit?.requestsPerMinute ?? 60,
        fetcher: async () => {
          const response = await requestJson<SearchResponse>(
            `${API}/search?q=${encodeURIComponent(ctx.name)}&per_page=25`,
            { signal: deps.signal, expectedStatuses: [404] },
          )
          return response.data
        },
      })
      data = result.value
      fromCache = result.fromCache
    } catch (cause) {
      const err = cause instanceof SourceRequestError ? cause : undefined
      if (cause instanceof RateLimitedError || err?.code === 'RATE_LIMITED') {
        return unverifiable(
          'fr_entreprises',
          'RATE_LIMITED',
          'The French company register was rate-limited and not checked. This is not evidence the name is unused.',
          true,
        )
      }
      return unverifiable(
        'fr_entreprises',
        err?.code ?? 'SEARCH_FAILED',
        'The French company register could not be reached.',
        true,
      )
    }

    const exactMatches: Match[] = []
    const similarMatches: Match[] = []
    const seen = new Set<string>()

    for (const item of data?.results ?? []) {
      const title = item.nom_complet ?? item.nom_raison_sociale
      if (title === undefined || title.trim() === '') continue

      const isExact = normalize(title) === target
      const similarity = compareNames(ctx.name, title)
      const contains = containsNameAsWord(ctx.name, title)
      if (!isExact && !contains && similarity.overall < SIMILARITY_FLOOR) continue

      const dedupeKey = normalize(title)
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)

      const active = isActive(item.etat_administratif)
      const url = `https://annuaire-entreprises.data.gouv.fr/entreprise/${item.siren}`
      const industry = item.activite_principale === undefined
        ? undefined
        : industryForNaceDivision(item.activite_principale)

      const detail = [
        active ? 'active' : 'closed',
        item.date_creation === undefined ? undefined : `registered ${item.date_creation}`,
        item.date_fermeture === undefined ? undefined : `closed ${item.date_fermeture}`,
        item.siege?.libelle_commune,
      ].filter((part): part is string => part !== undefined)

      const match: Match = {
        externalId: item.siren,
        name: title,
        categories: ['fr-company', ...(industry === undefined ? [] : [industry])],
        active,
        url,
        similarity,
        // A registered company name is legally meaningful, matching the
        // Companies House posture.
        severity: severityFor(similarity, {
          active,
          legallyWeighted: true,
          contained: contains,
          leading: leadsWithName(ctx.name, title),
        }),
        evidence: [makeEvidence('fr_entreprises', `${title}: ${detail.join(', ')}`, url)],
      }

      if (isExact) exactMatches.push(match)
      else similarMatches.push(match)
    }

    similarMatches.sort((a, b) => b.similarity.overall - a.similarity.overall)

    const total = data?.total_results ?? 0
    const evidence: Evidence[] = [
      makeEvidence(
        'fr_entreprises',
        `Searched the French company register for "${ctx.name}": ${total} ${total === 1 ? 'result' : 'results'} on the register`,
      ),
      makeEvidence(
        'fr_entreprises',
        'Covers companies registered in France only. A name used elsewhere will not appear here.',
      ),
    ]

    deps.log('fr_entreprises.checked', {
      exact: exactMatches.length,
      similar: similarMatches.length,
      fromCache,
    })

    return buildResult({
      source: 'fr_entreprises',
      status: statusFromMatches(exactMatches, similarMatches),
      exactMatches,
      similarMatches: similarMatches.slice(0, 6),
      evidence,
      fromCache,
    })
  },
}
