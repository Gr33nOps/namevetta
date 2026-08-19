/**
 * SEC EDGAR registered company names.
 *
 * The SEC publishes the full list of registrants as a single JSON file. We
 * fetch it once, hold it in memory, and search it locally with the similarity
 * engine — which is the only way to do fuzzy matching properly, since no remote
 * endpoint will run Levenshtein for us.
 *
 * Scope, stated plainly wherever this appears: EDGAR covers **SEC registrants
 * and public-reporting entities**. It is emphatically *not* a comprehensive
 * database of US companies — the overwhelming majority of US businesses never
 * file with the SEC and do not appear here at all. It is authoritative for what
 * it contains and silent about everything else, so a clean result says very
 * little about whether some company already uses the name.
 *
 * Access follows the SEC fair-access policy: an identifying User-Agent carrying
 * a contact address is mandatory, and the company list is fetched once per day
 * rather than once per scan.
 */
import type { AdapterDeps, SourceAdapter } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import type { Evidence, Match, SourceResult } from '@/lib/core/types'
import { env } from '@/lib/env'
import { requestJson, SourceRequestError } from '@/lib/sources/http'
import { buildResult, makeEvidence, statusFromMatches, unverifiable } from '@/lib/sources/result'
import { severityFor } from '@/lib/sources/severity'
import { normalize } from '@/lib/similarity/normalize'
import { compareNames, containsNameAsWord } from '@/lib/similarity/score'

const TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json'

const SIMILARITY_FLOOR = 72
const CORPUS_TTL_MS = 24 * 60 * 60 * 1000

interface TickerEntry {
  cik_str?: number
  ticker?: string
  title?: string
}

interface CompanyRecord {
  cik: number
  ticker: string
  title: string
  normalized: string
}

interface Corpus {
  records: CompanyRecord[]
  loadedAt: number
}

let corpus: Corpus | undefined

/** Test seam: drop the memoised corpus between cases. */
export function resetEdgarCorpus(): void {
  corpus = undefined
}

/**
 * Corporate suffixes carry no distinguishing power — every third company is an
 * "Inc" — so they are stripped before comparison. Otherwise every pair of
 * companies would score as partially similar purely on the suffix.
 */
const CORPORATE_SUFFIX =
  /\b(inc|incorporated|corp|corporation|co|company|ltd|limited|llc|lp|plc|holdings?|group|sa|nv|ag|gmbh|trust|fund|partners)\b\.?/gi

function stripSuffixes(title: string): string {
  return title.replace(CORPORATE_SUFFIX, ' ').replace(/[\s,.]+/g, ' ').trim()
}

async function loadCorpus(signal: AbortSignal): Promise<Corpus> {
  if (corpus !== undefined && Date.now() - corpus.loadedAt < CORPUS_TTL_MS) return corpus

  const { data } = await requestJson<Record<string, TickerEntry>>(TICKERS_URL, {
    signal,
    expectedStatuses: [],
    retries: 1,
  })

  const records: CompanyRecord[] = []
  for (const entry of Object.values(data ?? {})) {
    const title = entry.title
    if (title === undefined || title.trim() === '') continue
    records.push({
      cik: entry.cik_str ?? 0,
      ticker: entry.ticker ?? '',
      title,
      normalized: normalize(stripSuffixes(title)),
    })
  }

  corpus = { records, loadedAt: Date.now() }
  return corpus
}

export const edgarAdapter: SourceAdapter = {
  id: 'edgar',

  async run(ctx: ScanContext, deps: AdapterDeps): Promise<SourceResult> {
    // The SEC requires a declared User-Agent carrying a contact address. Without
    // one we would be making non-compliant automated requests, so we decline to
    // make them at all and say why.
    if (env().CONTACT_EMAIL === undefined) {
      return unverifiable(
        'edgar',
        'NO_CONTACT_EMAIL',
        'SEC EDGAR requires a contact address in the User-Agent. Set CONTACT_EMAIL to enable this source.',
        false,
      )
    }

    const target = normalize(ctx.name)
    if (target.length === 0) {
      return unverifiable('edgar', 'INVALID_NAME', 'Name contains no usable characters', false)
    }

    let loaded: Corpus
    try {
      loaded = await loadCorpus(deps.signal)
    } catch (cause) {
      const err = cause instanceof SourceRequestError ? cause : undefined
      return unverifiable(
        'edgar',
        err?.code ?? 'CORPUS_FAILED',
        'The SEC company list could not be downloaded.',
        true,
      )
    }

    const exactMatches: Match[] = []
    const similarMatches: Match[] = []
    // The SEC lists share classes as separate registrants with identical names,
    // so the raw list yields visible duplicates. Keep the first of each name.
    const seenTitles = new Set<string>()

    for (const record of loaded.records) {
      const isExact = record.normalized === target
      // Cheap length gate before running the full comparison across ~10k rows.
      // Names that *contain* the candidate are exempt: they are legitimately
      // longer, and gating them out is what hid "<Name> Holdings" style filers.
      const contains = !isExact && record.normalized.includes(target) && target.length >= 3
      if (!isExact && !contains && Math.abs(record.normalized.length - target.length) > 4) continue

      const stripped = stripSuffixes(record.title)
      const wholeWord = contains && containsNameAsWord(ctx.name, stripped)
      const similarity = compareNames(ctx.name, stripped)
      if (!isExact && !wholeWord && similarity.overall < SIMILARITY_FLOOR) continue

      const titleKey = record.normalized
      if (seenTitles.has(titleKey)) continue
      seenTitles.add(titleKey)

      const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${record.cik}&type=&dateb=&owner=include&count=40`
      const match: Match = {
        externalId: String(record.cik),
        name: record.title,
        categories: record.ticker === '' ? ['sec-filer'] : ['sec-filer', record.ticker],
        active: true,
        url,
        similarity,
        severity: severityFor(similarity, { legallyWeighted: true, contained: wholeWord }),
        evidence: [
          makeEvidence(
            'edgar',
            `SEC registrant "${record.title}"${record.ticker === '' ? '' : ` (${record.ticker})`}`,
            url,
          ),
        ],
      }

      if (isExact) exactMatches.push(match)
      else similarMatches.push(match)
    }

    similarMatches.sort((a, b) => b.similarity.overall - a.similarity.overall)

    const evidence: Evidence[] = [
      makeEvidence(
        'edgar',
        `Compared against ${loaded.records.length.toLocaleString('en-US')} SEC-registered companies`,
      ),
      makeEvidence(
        'edgar',
        'EDGAR covers SEC registrants and public-reporting entities, not US companies in general. Private companies, most small businesses and non-US companies do not file with the SEC and will not appear here.',
      ),
    ]

    deps.log('edgar.checked', {
      corpus: loaded.records.length,
      exact: exactMatches.length,
      similar: similarMatches.length,
    })

    return buildResult({
      source: 'edgar',
      status: statusFromMatches(exactMatches, similarMatches),
      exactMatches,
      similarMatches: similarMatches.slice(0, 8),
      evidence,
    })
  },
}
