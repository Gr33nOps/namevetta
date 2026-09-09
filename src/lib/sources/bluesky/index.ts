/**
 * Bluesky handle check, via the AT Protocol's public API.
 *
 * The one social platform beyond YouTube with a free, official,
 * unauthenticated identity lookup: `resolveHandle` answers definitively
 * whether `<name>.bsky.social` is claimed, and `searchActors` finds similar
 * handles. Every other platform in `socials/index.ts` stays manual-only
 * precisely because nothing else offers this — an unauthenticated profile
 * fetch elsewhere can return a login wall or a soft 404 that would read as
 * "handle is free" when it means nothing of the kind.
 */
import type { AdapterDeps, SourceAdapter } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import type { Evidence, Match, SourceResult } from '@/lib/core/types'
import { requestJson, SourceRequestError } from '@/lib/sources/http'
import { buildResult, makeEvidence, statusFromMatches, unverifiable } from '@/lib/sources/result'
import { severityFor } from '@/lib/sources/severity'
import { normalize } from '@/lib/similarity/normalize'
import { compareNames } from '@/lib/similarity/score'

const API = 'https://public.api.bsky.app/xrpc'

/** Below this a search hit is noise rather than a naming concern. */
const SIMILARITY_FLOOR = 65

/**
 * A display name that is safe to put in a `Match`.
 *
 * Bluesky returns `displayName: ""` for accounts that have not set one — about
 * one profile in 250 in a sample of 250. `displayName ?? handle` keeps the
 * empty string, because `??` only catches null and undefined, and `Match.name`
 * requires at least one character. The whole result then failed validation at
 * the orchestrator boundary and was discarded as `INVALID_ADAPTER_OUTPUT`,
 * which is most of what Bluesky's malformed-output rate was.
 *
 * Falling back to the handle is also the better label: an account with no
 * display name is known by its handle anyway.
 */
function displayLabel(displayName: string | undefined, handle: string): string {
  const trimmed = displayName?.trim() ?? ''
  return trimmed === '' ? handle : trimmed
}

/** Same guard for the optional free-text field, which must not be blank. */
function describe(description: string | undefined): { description: string } | Record<string, never> {
  const trimmed = description?.trim() ?? ''
  return trimmed === '' ? {} : { description: trimmed }
}

interface ResolveHandleResponse {
  did?: string
  error?: string
}

interface Profile {
  displayName?: string
  description?: string
}

interface SearchActor {
  did: string
  handle: string
  displayName?: string
  description?: string
}

interface SearchActorsResponse {
  actors?: SearchActor[]
}

export const blueskyAdapter: SourceAdapter = {
  id: 'bluesky',

  async run(ctx: ScanContext, deps: AdapterDeps): Promise<SourceResult> {
    const handle = normalize(ctx.name)
    if (handle.length === 0) {
      return unverifiable('bluesky', 'INVALID_NAME', 'Name contains no usable characters', false)
    }

    const evidence: Evidence[] = []
    const exactMatches: Match[] = []
    const similarMatches: Match[] = []
    const candidateHandle = `${handle}.bsky.social`

    try {
      const { status, data } = await requestJson<ResolveHandleResponse>(
        `${API}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(candidateHandle)}`,
        { signal: deps.signal, expectedStatuses: [400] },
      )

      if (status === 400) {
        if (data?.error === 'InvalidRequest') {
          evidence.push(makeEvidence('bluesky', `@${candidateHandle} is unclaimed`))
        } else {
          /*
            A 400 that is not `InvalidRequest` is Bluesky telling us something
            went wrong, not telling us the handle is free — and falling through
            here used to land on `no_conflict`, reporting an unknown handle as
            clear. That is the exact false green this product exists to avoid.
          */
          return unverifiable(
            'bluesky',
            'UNCLEAR',
            `Bluesky answered ${data?.error ?? 'an unrecognised error'} for @${candidateHandle}, which does not say whether it is claimed.`,
            true,
          )
        }
      } else if (data?.did !== undefined) {
        const did = data.did
        const url = `https://bsky.app/profile/${candidateHandle}`

        // Handle resolution alone is already a real, definitive answer. The
        // profile fetch only adds display name and follower context, so its
        // failure is a bonus lost, not a check failed.
        let displayName: string | undefined
        let description: string | undefined
        try {
          const profile = await requestJson<Profile>(
            `${API}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
            { signal: deps.signal, expectedStatuses: [400, 404] },
          )
          displayName = profile.data?.displayName
          description = profile.data?.description
        } catch {
          // Best-effort only.
        }

        exactMatches.push({
          externalId: did,
          name: displayLabel(displayName, candidateHandle),
          categories: ['bluesky'],
          active: true,
          url,
          similarity: compareNames(ctx.name, candidateHandle),
          severity: 'high',
          evidence: [makeEvidence('bluesky', `@${candidateHandle} is claimed`, url)],
          ...describe(description),
        })
      }
    } catch (cause) {
      const err = cause instanceof SourceRequestError ? cause : undefined
      return unverifiable('bluesky', err?.code ?? 'LOOKUP_FAILED', 'Bluesky could not be reached.', true)
    }

    try {
      const { data } = await requestJson<SearchActorsResponse>(
        `${API}/app.bsky.actor.searchActors?q=${encodeURIComponent(handle)}&limit=15`,
        { signal: deps.signal, expectedStatuses: [400] },
      )

      for (const actor of data?.actors ?? []) {
        if (actor.handle === candidateHandle) continue

        const label = displayLabel(actor.displayName, actor.handle)
        const nameSim = compareNames(ctx.name, actor.handle)
        const displaySim = label === actor.handle ? undefined : compareNames(ctx.name, label)
        const best = displaySim !== undefined && displaySim.overall > nameSim.overall ? displaySim : nameSim
        if (best.overall < SIMILARITY_FLOOR) continue

        const url = `https://bsky.app/profile/${actor.handle}`
        similarMatches.push({
          externalId: actor.did,
          name: label,
          categories: ['bluesky'],
          active: true,
          url,
          similarity: best,
          severity: severityFor(best),
          evidence: [makeEvidence('bluesky', `Similar handle @${actor.handle}`, url)],
          ...describe(actor.description),
        })
      }
      evidence.push(makeEvidence('bluesky', `Searched Bluesky for handles similar to "${handle}"`))
    } catch {
      evidence.push(
        makeEvidence(
          'bluesky',
          'Similar-handle search did not complete; the exact result above still applies',
        ),
      )
    }

    deps.log('bluesky.checked', { exact: exactMatches.length, similar: similarMatches.length })

    return buildResult({
      source: 'bluesky',
      status: statusFromMatches(exactMatches, similarMatches),
      exactMatches,
      similarMatches,
      evidence,
    })
  },
}
