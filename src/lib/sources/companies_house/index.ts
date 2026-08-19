/**
 * Companies House (UK) company register.
 *
 * A genuine registry rather than a search index: if a company is incorporated in
 * the UK it is here, with its legal name, its status and its declared industry.
 * That authority is why the manifest gives it a 95 confidence ceiling.
 *
 * Scope, stated in the evidence so a clean result is never over-read: this
 * covers **UK-registered companies only**. A US startup, a sole trader or an
 * unincorporated brand will not appear, and their absence says nothing.
 *
 * Uses `/advanced-search/companies` rather than the general `/search/companies`
 * endpoint, for two reasons that both showed up the first time this ran against
 * "Monzo". The general endpoint is fuzzy and *not* relevance-ranked — it
 * returned unrelated companies ahead of MONZO BANK LIMITED — whereas
 * `company_name_includes` is exact containment, which is the question actually
 * being asked. And advanced search returns `sic_codes`, the only declared
 * industry signal any source in this product provides. Without it, industry
 * relevance is unknown, and severity is capped by design when the field cannot
 * be established — so an active UK bank trading under the candidate name read
 * as a weak conflict.
 *
 * Auth is HTTP Basic with the API key as the username and an empty password,
 * which is the scheme Companies House documents.
 */
import type { AdapterDeps, SourceAdapter } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import type { Evidence, Match, SourceResult } from '@/lib/core/types'
import { SOURCE_MANIFEST } from '@/lib/core/adapter'
import { env } from '@/lib/env'
import { industriesForSicCodes } from '@/lib/industry/sic'
import { requestJson, SourceRequestError } from '@/lib/sources/http'
import { RateLimitedError, throttledFetch } from '@/lib/sources/rate-limit'
import { buildResult, makeEvidence, statusFromMatches, unverifiable } from '@/lib/sources/result'
import { severityFor } from '@/lib/sources/severity'
import { normalize } from '@/lib/similarity/normalize'
import { compareNames, containsNameAsWord, leadsWithName } from '@/lib/similarity/score'

const API = 'https://api.company-information.service.gov.uk'

const SIMILARITY_FLOOR = 72

interface CompanyItem {
  company_name?: string
  company_number?: string
  company_status?: string
  company_type?: string
  date_of_creation?: string
  date_of_cessation?: string
  sic_codes?: string[]
  registered_office_address?: { locality?: string; postal_code?: string; country?: string }
}

interface SearchResponse {
  hits?: number
  items?: CompanyItem[]
}

/**
 * Corporate suffixes carry no distinguishing power — the register is full of
 * "LTD" — so they are stripped before comparison. Without this, every pair of
 * UK companies would look partly similar on the suffix alone.
 *
 * "Holdings", "Group" and "UK" are deliberately *not* stripped: unlike a legal
 * form they are part of how the company presents itself, and removing them
 * would collapse genuinely distinct registrations onto one another.
 */
const UK_SUFFIX = /\b(limited|ltd|plc|llp|lp|cic|cio)\b\.?/gi

function stripSuffixes(title: string): string {
  const stripped = title.replace(UK_SUFFIX, ' ').replace(/[\s,.]+/g, ' ').trim()
  // Never strip a name down to nothing — a company genuinely called "Limited"
  // should be compared as written rather than as an empty string.
  return stripped === '' ? title.trim() : stripped
}

/** Dissolved and liquidated companies are weaker evidence than live ones. */
const INACTIVE = [
  'dissolved',
  'liquidation',
  'closed',
  'converted-closed',
  'removed',
  'receivership',
]

function isActive(status: string | undefined): boolean {
  if (status === undefined) return true
  return !INACTIVE.includes(status)
}

function locationOf(item: CompanyItem): string | undefined {
  const parts = [item.registered_office_address?.locality, item.registered_office_address?.country]
    .filter((part): part is string => part !== undefined && part.trim() !== '')
  return parts.length === 0 ? undefined : parts.join(', ')
}

export const companiesHouseAdapter: SourceAdapter = {
  id: 'companies_house',

  async run(ctx: ScanContext, deps: AdapterDeps): Promise<SourceResult> {
    const key = env().COMPANIES_HOUSE_API_KEY
    if (key === undefined) {
      return unverifiable(
        'companies_house',
        'NO_API_KEY',
        'The UK company register was not checked because no API key is configured.',
        false,
      )
    }

    const target = normalize(ctx.name)
    if (target.length === 0) {
      return unverifiable(
        'companies_house',
        'INVALID_NAME',
        'Name contains no usable characters',
        false,
      )
    }

    const manifest = SOURCE_MANIFEST.companies_house
    // HTTP Basic, key as username, blank password — the documented scheme.
    const auth = Buffer.from(`${key}:`).toString('base64')

    let data: SearchResponse | undefined
    let fromCache = false

    try {
      const result = await throttledFetch<SearchResponse | undefined>({
        source: 'companies_house',
        cacheKey: `companies_house:adv:${target}`,
        ttlSeconds: manifest.cacheTtlSeconds,
        requestsPerMinute: manifest.rateLimit?.requestsPerMinute ?? 60,
        fetcher: async () => {
          const response = await requestJson<SearchResponse>(
            `${API}/advanced-search/companies?company_name_includes=${encodeURIComponent(ctx.name)}&size=100`,
            {
              signal: deps.signal,
              // Never logged; the shared client does not log headers.
              headers: { authorization: `Basic ${auth}` },
              expectedStatuses: [404],
            },
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
          'companies_house',
          'RATE_LIMITED',
          'The UK company register was rate-limited and not checked. This is not evidence the name is unused.',
          true,
        )
      }
      if (err?.status === 401 || err?.status === 403) {
        return unverifiable(
          'companies_house',
          'AUTH_FAILED',
          'The UK company register rejected our credentials.',
          false,
        )
      }
      return unverifiable(
        'companies_house',
        err?.code ?? 'SEARCH_FAILED',
        'The UK company register could not be reached.',
        true,
      )
    }

    const exactMatches: Match[] = []
    const similarMatches: Match[] = []
    const seen = new Set<string>()

    for (const item of data?.items ?? []) {
      const title = item.company_name
      if (title === undefined || title.trim() === '') continue

      const stripped = stripSuffixes(title)
      const isExact = normalize(stripped) === target
      const similarity = compareNames(ctx.name, stripped)

      // "MONZO BANK LIMITED" scores ~37 against "Monzo" purely on length, and
      // the floor alone hid every one of the MONZO companies on the register. A
      // company trading under your name with a word appended is precisely what
      // this source exists to surface.
      const contains = containsNameAsWord(ctx.name, stripped)
      if (!isExact && !contains && similarity.overall < SIMILARITY_FLOOR) continue

      // The register lists near-identical names constantly; one per normalised
      // name is enough to make the point.
      const dedupeKey = normalize(stripped)
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)

      const active = isActive(item.company_status)
      const number = item.company_number ?? ''
      const url =
        number === ''
          ? undefined
          : `https://find-and-update.company-information.service.gov.uk/company/${number}`

      // Declared SIC codes are handed to enrichment as taxonomy ids, which is
      // what lets industry relevance — and therefore severity — mean anything
      // here. A registered office address classifies nothing.
      const industries = industriesForSicCodes(item.sic_codes ?? [])

      const detail = [
        item.company_status ?? 'status unknown',
        item.date_of_creation === undefined ? undefined : `incorporated ${item.date_of_creation}`,
        item.date_of_cessation === undefined ? undefined : `dissolved ${item.date_of_cessation}`,
        locationOf(item),
      ].filter((part): part is string => part !== undefined)

      const match: Match = {
        externalId: number === '' ? title : number,
        name: title,
        // Compared without the legal suffix, so re-scoring downstream does not
        // silently undo the stripping this adapter just did.
        comparisonName: stripped,
        categories: [
          'uk-company',
          ...(item.company_status === undefined ? [] : [item.company_status]),
          ...industries,
        ],
        active,
        similarity,
        // A registered company name is legally meaningful, not merely
        // inconvenient, so this source can reach `critical`.
        severity: severityFor(similarity, {
          active,
          legallyWeighted: true,
          contained: contains,
          leading: leadsWithName(ctx.name, stripped),
        }),
        evidence: [makeEvidence('companies_house', `${title}: ${detail.join(', ')}`, url)],
        ...(url === undefined ? {} : { url }),
      }

      if (isExact) exactMatches.push(match)
      else similarMatches.push(match)
    }

    similarMatches.sort((a, b) => b.similarity.overall - a.similarity.overall)

    const live = [...exactMatches, ...similarMatches].filter((m) => m.active === true).length
    const hits = data?.hits ?? 0
    const evidence: Evidence[] = [
      makeEvidence(
        'companies_house',
        `Searched the UK company register for names containing "${ctx.name}": ${hits} ${hits === 1 ? 'company' : 'companies'} on the register, ${live} of those shown here still active`,
      ),
      makeEvidence(
        'companies_house',
        'Companies House covers UK-registered companies only. Sole traders, unincorporated brands and non-UK companies do not appear here.',
      ),
    ]

    deps.log('companies_house.checked', {
      exact: exactMatches.length,
      similar: similarMatches.length,
      fromCache,
    })

    return buildResult({
      source: 'companies_house',
      status: statusFromMatches(exactMatches, similarMatches),
      exactMatches,
      similarMatches: similarMatches.slice(0, 6),
      evidence,
      fromCache,
    })
  },
}
