/**
 * Flathub (Linux desktop app store) check.
 *
 * Flathub publishes no query-based search API — the only structured endpoint
 * is `/api/v2/appstream`, a flat list of every app's reverse-DNS id
 * (`org.gimp.GIMP`, `com.spotify.Client`). That list is genuinely small
 * (~90 KB for ~3,300 apps, confirmed live), unlike F-Droid's equivalent
 * (~56 MB) or Homebrew's (~18 MB) — both too large to fetch per scan, which is
 * exactly why F-Droid was evaluated and left out rather than forced in. This
 * is fetched once, held in memory, and searched locally with the similarity
 * engine, the same shape as SEC EDGAR's company list.
 *
 * The app's display name is not published — only the id is — so it is
 * inferred as the id's final segment. That is usually right ("org.gimp.GIMP"
 * -> "GIMP") but sometimes generic ("net.blockattack.game" -> "game") or
 * abbreviated ("ru.yandex.Browser" -> "Browser" rather than "Yandex
 * Browser"), which is why this source's confidence ceiling sits with the
 * other official-but-inferential sources rather than alongside a first-party
 * exact lookup.
 */
import type { AdapterDeps, SourceAdapter } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import type { Evidence, Match, SourceResult } from '@/lib/core/types'
import { requestJson, SourceRequestError } from '@/lib/sources/http'
import { buildResult, makeEvidence, statusFromMatches, unverifiable } from '@/lib/sources/result'
import { severityFor } from '@/lib/sources/severity'
import { normalize } from '@/lib/similarity/normalize'
import { compareNames, containsNameAsWord } from '@/lib/similarity/score'

const APPSTREAM_URL = 'https://flathub.org/api/v2/appstream'

const SIMILARITY_FLOOR = 72
const CORPUS_TTL_MS = 24 * 60 * 60 * 1000

interface AppRecord {
  id: string
  name: string
  normalized: string
}

interface Corpus {
  records: AppRecord[]
  loadedAt: number
}

let corpus: Corpus | undefined

/** Test seam: drop the memoised corpus between cases. */
export function resetFlathubCorpus(): void {
  corpus = undefined
}

/** The id's final reverse-DNS segment, which is usually the app's real name. */
function nameFromId(id: string): string {
  const parts = id.split('.')
  return parts[parts.length - 1] ?? id
}

async function loadCorpus(signal: AbortSignal): Promise<Corpus> {
  if (corpus !== undefined && Date.now() - corpus.loadedAt < CORPUS_TTL_MS) return corpus

  const { data } = await requestJson<string[]>(APPSTREAM_URL, {
    signal,
    expectedStatuses: [],
    retries: 1,
  })

  const records: AppRecord[] = []
  for (const id of data ?? []) {
    if (typeof id !== 'string' || id.trim() === '') continue
    const name = nameFromId(id)
    records.push({ id, name, normalized: normalize(name) })
  }

  corpus = { records, loadedAt: Date.now() }
  return corpus
}

export const flathubAdapter: SourceAdapter = {
  id: 'flathub',

  async run(ctx: ScanContext, deps: AdapterDeps): Promise<SourceResult> {
    const target = normalize(ctx.name)
    if (target.length === 0) {
      return unverifiable('flathub', 'INVALID_NAME', 'Name contains no usable characters', false)
    }

    let loaded: Corpus
    try {
      loaded = await loadCorpus(deps.signal)
    } catch (cause) {
      const err = cause instanceof SourceRequestError ? cause : undefined
      return unverifiable(
        'flathub',
        err?.code ?? 'CORPUS_FAILED',
        'The Flathub app list could not be downloaded.',
        true,
      )
    }

    const exactMatches: Match[] = []
    const similarMatches: Match[] = []
    const seenNames = new Set<string>()

    for (const record of loaded.records) {
      const isExact = record.normalized === target
      // Cheap length gate before running the full comparison across ~3,300
      // rows, mirroring EDGAR. Contained names are exempt for the same reason
      // it matters there: a longer match is not a weaker one.
      const contains = !isExact && record.normalized.includes(target) && target.length >= 3
      if (!isExact && !contains && Math.abs(record.normalized.length - target.length) > 4) continue

      const wholeWord = contains && containsNameAsWord(ctx.name, record.name)
      const similarity = compareNames(ctx.name, record.name)
      if (!isExact && !wholeWord && similarity.overall < SIMILARITY_FLOOR) continue

      if (seenNames.has(record.normalized)) continue
      seenNames.add(record.normalized)

      const url = `https://flathub.org/apps/${record.id}`
      const match: Match = {
        externalId: record.id,
        name: record.name,
        categories: ['flathub'],
        active: true,
        url,
        similarity,
        severity: severityFor(similarity, { contained: wholeWord }),
        evidence: [makeEvidence('flathub', `Flathub app "${record.name}" (${record.id})`, url)],
      }

      if (isExact) exactMatches.push(match)
      else similarMatches.push(match)
    }

    similarMatches.sort((a, b) => b.similarity.overall - a.similarity.overall)

    const evidence: Evidence[] = [
      makeEvidence(
        'flathub',
        `Compared against ${loaded.records.length.toLocaleString('en-US')} Flathub app listings`,
      ),
      makeEvidence(
        'flathub',
        'Flathub publishes no app names directly, only ids. The name shown here is inferred from the id and may not exactly match the app’s real display name.',
      ),
    ]

    deps.log('flathub.checked', {
      corpus: loaded.records.length,
      exact: exactMatches.length,
      similar: similarMatches.length,
    })

    return buildResult({
      source: 'flathub',
      status: statusFromMatches(exactMatches, similarMatches),
      exactMatches,
      similarMatches: similarMatches.slice(0, 6),
      evidence,
    })
  },
}
