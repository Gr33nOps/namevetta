/**
 * YouTube handle check (§11).
 *
 * `channels.list` with `forHandle` is an exact handle lookup, which makes
 * YouTube the one social surface we can verify properly for free — everything
 * else in the socials adapter is manual by necessity (§14).
 *
 * Quota discipline matters here: `channels.list` costs 1 unit against a 10,000
 * unit daily allowance, while `search.list` costs 100. Similar-channel discovery
 * is therefore Deep-only and capped, so a burst of Quick Checks can never
 * exhaust the day's quota.
 */
import type { AdapterDeps, SourceAdapter } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import type { Evidence, Match, SourceResult } from '@/lib/core/types'
import { env } from '@/lib/env'
import { requestJson, SourceRequestError } from '@/lib/sources/http'
import { buildResult, makeEvidence, statusFromMatches, unverifiable } from '@/lib/sources/result'
import { severityFor } from '@/lib/sources/severity'
import { normalize } from '@/lib/similarity/normalize'
import { compareNames } from '@/lib/similarity/score'

const API = 'https://www.googleapis.com/youtube/v3'

interface ChannelList {
  items?: {
    id: string
    snippet?: { title?: string; description?: string; customUrl?: string }
  }[]
}

interface SearchList {
  items?: {
    id?: { channelId?: string }
    snippet?: { title?: string; description?: string; channelId?: string }
  }[]
}

export const youtubeAdapter: SourceAdapter = {
  id: 'youtube',

  async run(ctx: ScanContext, deps: AdapterDeps): Promise<SourceResult> {
    const key = env().YOUTUBE_API_KEY
    if (key === undefined) {
      // No key means no check. Saying so is the whole point — the alternative
      // is a report implying the handle is free when nobody ever looked.
      return unverifiable(
        'youtube',
        'NO_API_KEY',
        'YouTube was not checked because no API key is configured.',
        false,
      )
    }

    const handle = normalize(ctx.name)
    if (handle.length === 0) {
      return unverifiable('youtube', 'INVALID_NAME', 'Name contains no usable characters', false)
    }

    const evidence: Evidence[] = []
    const exactMatches: Match[] = []
    const similarMatches: Match[] = []

    try {
      const { data } = await requestJson<ChannelList>(
        `${API}/channels?part=snippet&forHandle=${encodeURIComponent(handle)}&key=${key}`,
        { signal: deps.signal, expectedStatuses: [404] },
      )

      const channel = data?.items?.[0]
      if (channel === undefined) {
        evidence.push(makeEvidence('youtube', `Handle @${handle} resolves to no channel`))
      } else {
        const title = channel.snippet?.title ?? handle
        const url = `https://youtube.com/@${handle}`
        exactMatches.push({
          externalId: channel.id,
          name: title,
          categories: ['youtube-channel'],
          active: true,
          url,
          similarity: compareNames(ctx.name, title),
          severity: 'high',
          evidence: [makeEvidence('youtube', `Handle @${handle} is taken by "${title}"`, url)],
          ...(channel.snippet?.description === undefined
            ? {}
            : { description: channel.snippet.description }),
        })
      }
    } catch (cause) {
      const err = cause instanceof SourceRequestError ? cause : undefined
      return unverifiable(
        'youtube',
        err?.code ?? 'LOOKUP_FAILED',
        err?.status === 403
          ? 'YouTube API quota exceeded or key rejected.'
          : 'The YouTube handle lookup failed.',
        true,
      )
    }

    // Similar-channel discovery costs 100x an exact lookup, so it is Deep-only.
    if (ctx.scanType === 'deep') {
      try {
        const { data } = await requestJson<SearchList>(
          `${API}/search?part=snippet&type=channel&maxResults=10&q=${encodeURIComponent(ctx.name)}&key=${key}`,
          { signal: deps.signal, expectedStatuses: [404], retries: 0 },
        )

        for (const item of data?.items ?? []) {
          const title = item.snippet?.title
          const channelId = item.id?.channelId ?? item.snippet?.channelId
          if (title === undefined || channelId === undefined) continue
          if (normalize(title) === handle) continue

          const similarity = compareNames(ctx.name, title)
          if (similarity.overall < 70) continue

          similarMatches.push({
            externalId: channelId,
            name: title,
            categories: ['youtube-channel'],
            active: true,
            url: `https://youtube.com/channel/${channelId}`,
            similarity,
            severity: severityFor(similarity),
            evidence: [
              makeEvidence(
                'youtube',
                `Similar channel "${title}"`,
                `https://youtube.com/channel/${channelId}`,
              ),
            ],
            ...(item.snippet?.description === undefined
              ? {}
              : { description: item.snippet.description }),
          })
        }
        evidence.push(makeEvidence('youtube', 'Searched for similarly named channels'))
      } catch {
        evidence.push(
          makeEvidence('youtube', 'Similar-channel search did not complete; handle result above still applies'),
        )
      }
    }

    deps.log('youtube.checked', { exact: exactMatches.length, similar: similarMatches.length })

    return buildResult({
      source: 'youtube',
      status: statusFromMatches(exactMatches, similarMatches),
      exactMatches,
      similarMatches,
      evidence,
    })
  },
}
