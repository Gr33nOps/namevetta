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
          evidence.push(
            makeEvidence('bluesky', `Could not determine whether @${candidateHandle} is claimed`),
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
          name: displayName ?? candidateHandle,
          categories: ['bluesky'],
          active: true,
          url,
          similarity: compareNames(ctx.name, candidateHandle),
          severity: 'high',
          evidence: [makeEvidence('bluesky', `@${candidateHandle} is claimed`, url)],
          ...(description === undefined ? {} : { description }),
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

        const nameSim = compareNames(ctx.name, actor.handle)
        const displaySim =
          actor.displayName === undefined ? undefined : compareNames(ctx.name, actor.displayName)
        const best = displaySim !== undefined && displaySim.overall > nameSim.overall ? displaySim : nameSim
        if (best.overall < SIMILARITY_FLOOR) continue

        const url = `https://bsky.app/profile/${actor.handle}`
        similarMatches.push({
          externalId: actor.did,
          name: actor.displayName ?? actor.handle,
          categories: ['bluesky'],
          active: true,
          url,
          similarity: best,
          severity: severityFor(best),
          evidence: [makeEvidence('bluesky', `Similar handle @${actor.handle}`, url)],
          ...(actor.description === undefined ? {} : { description: actor.description }),
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
