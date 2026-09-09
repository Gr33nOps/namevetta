import 'server-only'
import { setTimeout as pause } from 'node:timers/promises'
import { CATEGORY_LABELS, GENERATED_NAME_COUNT, type Category } from '@/lib/core/scan'
import { compareCandidates, type Candidate, type ComparisonResult } from '@/lib/compare/rank'
import { generateNames } from './namegen'
import { sameFamily } from './dedupe'
import { disqualificationReason } from './screen'
import { checkCandidateDomain } from '@/lib/sources/domain'
import { runScanToCompletion } from '@/lib/orchestrator/run'

export interface ShortlistInput {
  category: Category
  description: string
  seed?: string
  includeSpecialized?: boolean
  signal?: AbortSignal
  onProgress?: (progress: { checked: number; accepted: number; round: number; message?: string }) => void
}

type Outcome =
  | { status: 'ready'; ranked: ComparisonResult }
  | { status: 'incomplete'; message: string }

/** Four researched survivors, or an explicit failure. Never pad with unchecked names. */
export async function generateShortlist(input: ShortlistInput): Promise<Outcome> {
  const signal = AbortSignal.any([AbortSignal.timeout(260_000), ...(input.signal ? [input.signal] : [])])
  const seen: string[] = []
  const survivors: Candidate[] = []
  const domains = new Map<string, { name: string; checkedAt: string }>()
  let checked = 0
  let fullChecks = 0
  let unavailable: string | undefined
  let providerRetries = 0

  for (let round = 1; round <= 4 && !signal.aborted; round++) {
    const generated = await generateNames(CATEGORY_LABELS[input.category], input.description, input.seed, {
      exclude: [...seen], maxAttempts: 1, signal, curate: true,
    })
    if (generated.status === 'unavailable') {
      unavailable = generated.reason
      if (generated.retryable && providerRetries < 2 && !signal.aborted) {
        providerRetries++
        input.onProgress?.({ checked, accepted: survivors.length, round, message: 'The naming service is busy. Retrying automatically; your brief and checked names are kept.' })
        try { await pause(generated.retryAfterMs ?? 1500, undefined, { signal }) } catch { break }
        // An outage is not a naming round. Keep the verified survivors and
        // allow the final round to recover within the overall time limit.
        round--
        continue
      }
      // Malformed/empty batches can recover with a fresh direction. Provider
      // outages and exhausted allowances should not repeatedly hit the service.
      if (!unavailable.includes('did not produce')) break
      continue
    }
    unavailable = undefined
    input.onProgress?.({ checked, accepted: survivors.length, round })
    for (const name of generated.names) {
      if (signal.aborted || fullChecks >= 16) break
      if (seen.some((previous) => sameFamily(name, previous))) continue
      seen.push(name)
      const domain = await checkCandidateDomain(name, AbortSignal.any([signal, AbortSignal.timeout(8_000)]))
      const checkedAt = new Date().toISOString()
      if (signal.aborted) break
      if (domain.state === 'no_registration') {
        fullChecks++
        const summary = await runScanToCompletion({
          name, category: input.category, description: input.description, scanType: 'quick',
          ...(input.includeSpecialized ? { includeSpecialized: true } : {}),
        }, { signal, overallTimeoutMs: 12_000 })
        if (signal.aborted) break
        // A score cannot compensate for missing evidence or a known conflict.
        const conflict = summary.results.some((result) => (result.source !== 'domain' && result.status === 'confirmed_conflict') || result.meta?.canonicalComState === 'registered')
        if (!conflict && summary.coverage >= 50 && summary.viability.score >= 65 && disqualificationReason(summary) === undefined) {
          survivors.push({ name, summary })
          domains.set(name, { name: domain.domain, checkedAt })
        }
      }
      checked++
      input.onProgress?.({ checked, accepted: survivors.length, round })
      if (survivors.length === GENERATED_NAME_COUNT) {
        const ranked = compareCandidates(survivors)
        ranked.candidates = ranked.candidates.map((candidate) => ({ ...candidate, domain: domains.get(candidate.name) }))
        return { status: 'ready', ranked }
      }
    }
    if (fullChecks >= 16) break
  }
  return { status: 'incomplete', message: unavailable ?? `We could only verify ${survivors.length} of ${GENERATED_NAME_COUNT} names this time. Try again or add a more specific detail to your brief. We have not included unchecked names.` }
}
