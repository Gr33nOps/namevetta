import 'server-only'
import { setTimeout as pause } from 'node:timers/promises'
import {
  CATEGORY_LABELS,
  GENERATED_NAME_COUNT,
  type Category,
} from '@/lib/core/scan'
import {
  compareCandidates,
  type Candidate,
  type ComparisonResult,
} from '@/lib/compare/rank'
import { generateNames, type NamingAnalysis } from './namegen'
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
  onProgress?: (progress: {
    checked: number
    accepted: number
    round: number
    message?: string
  }) => void
}

type Outcome =
  | { status: 'ready'; ranked: ComparisonResult }
  | { status: 'partial'; ranked: ComparisonResult; message: string }
  | { status: 'incomplete'; message: string }

/** Four researched survivors, or an explicit failure. Never pad with unchecked names. */
export async function generateShortlist(
  input: ShortlistInput,
): Promise<Outcome> {
  const deadline = new AbortController()
  const signal = AbortSignal.any([
    deadline.signal,
    ...(input.signal ? [input.signal] : []),
  ])
  const seen: string[] = []
  const survivors: Candidate[] = []
  const domains = new Map<
    string,
    {
      name: string
      checkedAt: string
      comState: 'registered' | 'no_registration' | 'unknown'
    }
  >()
  let checked = 0
  let fullChecks = 0
  let unavailable: string | undefined
  let providerRetries = 0
  let analysis: NamingAnalysis | undefined

  const rankedSurvivors = () => {
    const ranked = compareCandidates(survivors)
    ranked.candidates = survivors.map((survivor) => ({
      ...ranked.candidates.find(
        (candidate) => candidate.name === survivor.name,
      )!,
      domain: domains.get(survivor.name),
    }))
    return ranked
  }
  const finish = (): Outcome =>
    survivors.length
      ? {
          status: 'partial',
          ranked: rankedSurvivors(),
          message: `${survivors.length} checked ${survivors.length === 1 ? 'name is' : 'names are'} ready. We couldn't complete all four this time. You can keep these or try again.`,
        }
      : {
          status: 'incomplete',
          message:
            unavailable ??
            'No names passed the checks this time. Your brief is kept so you can try again.',
        }

  async function run(): Promise<Outcome> {
    for (let round = 1; round <= 4 && !signal.aborted; round++) {
      const generated = await generateNames(
        CATEGORY_LABELS[input.category],
        input.description,
        input.seed,
        {
          exclude: [...seen],
          signal,
          analysis,
          onAnalysis: (value) => {
            analysis = value
          },
          onStage: (stage) =>
            input.onProgress?.({
              checked,
              accepted: survivors.length,
              round,
              message:
                stage === 'analyze'
                  ? 'Understanding your idea.'
                  : stage === 'explore'
                    ? 'Exploring different naming directions.'
                    : stage === 'refine'
                      ? 'Developing stronger alternatives.'
                      : stage === 'critique'
                        ? 'Reviewing names for meaning, clarity and originality.'
                        : 'The naming service is busy. Your naming progress is kept while we retry.',
            }),
        },
      )
      if (generated.status === 'unavailable') {
        unavailable = generated.reason
        if (generated.retryable && providerRetries < 2 && !signal.aborted) {
          providerRetries++
          input.onProgress?.({
            checked,
            accepted: survivors.length,
            round,
            message:
              'The naming service is busy. Retrying automatically; your brief and checked names are kept.',
          })
          try {
            await pause(generated.retryAfterMs ?? 1500, undefined, { signal })
          } catch {
            break
          }
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
        const com = await checkCandidateDomain(
          name,
          AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
        )
        let domain = com
        if (com.state !== 'no_registration' && !signal.aborted) {
          const extensions = ['saas', 'mobile_app', 'developer_tool'].includes(
            input.category,
          )
            ? ['app', 'dev', 'net']
            : ['fashion', 'ecommerce', 'restaurant'].includes(input.category)
              ? ['shop', 'store', 'net']
              : ['studio', 'net', 'org']
          const alternatives = await Promise.all(
            extensions.map((tld) =>
              checkCandidateDomain(
                name,
                AbortSignal.any([signal, AbortSignal.timeout(8000)]),
                tld,
              ),
            ),
          )
          domain =
            alternatives.find((option) => option.state === 'no_registration') ??
            com
        }
        const checkedAt = new Date().toISOString()
        if (signal.aborted) break
        if (domain.state === 'no_registration') {
          fullChecks++
          const summary = await runScanToCompletion(
            {
              name,
              category: input.category,
              description: input.description,
              scanType: 'quick',
              ...(input.includeSpecialized ? { includeSpecialized: true } : {}),
            },
            { signal, overallTimeoutMs: 12_000 },
          )
          if (signal.aborted) break
          // A score cannot compensate for missing evidence or a known conflict.
          const conflict = summary.results.some(
            (result) =>
              (result.source !== 'domain' &&
                result.status === 'confirmed_conflict') ||
              (domain.domain.endsWith('.com') &&
                result.meta?.canonicalComState === 'registered'),
          )
          if (
            !conflict &&
            summary.coverage >= 50 &&
            summary.viability.score >= 65 &&
            disqualificationReason(summary) === undefined
          ) {
            survivors.push({ name, summary })
            domains.set(name, {
              name: domain.domain,
              checkedAt,
              comState: summary.results.some(
                (result) => result.meta?.canonicalComState === 'registered',
              )
                ? 'registered'
                : com.state,
            })
          }
        }
        checked++
        input.onProgress?.({ checked, accepted: survivors.length, round })
        if (survivors.length === GENERATED_NAME_COUNT) {
          return { status: 'ready', ranked: rankedSurvivors() }
        }
      }
      if (fullChecks >= 16) break
    }
    return finish()
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  let abort = () => {}
  const stopped = new Promise<Outcome>((resolve) => {
    abort = () => resolve(finish())
    signal.addEventListener('abort', abort, { once: true })
    timer = setTimeout(() => deadline.abort(), 260000)
    if (signal.aborted) abort()
  })
  try {
    return await Promise.race([run(), stopped])
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
}
