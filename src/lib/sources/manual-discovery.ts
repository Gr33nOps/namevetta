import type { SearchHit } from '@/lib/providers/web-search'
import type { DiscoveryMatch } from '@/lib/core/types'
import { normalize } from '@/lib/similarity/normalize'
import { compareNames } from '@/lib/similarity/score'

export type ManualPlatformName =
  | 'Instagram'
  | 'TikTok'
  | 'Reddit Community'
  | 'Twitch'
  | 'Threads'
  | 'Slack'

function identity(url: URL): { platform: ManualPlatformName; value: string; label: string } | undefined {
  const host = url.hostname.replace(/^www\./, '').toLowerCase()
  const parts = url.pathname.split('/').filter(Boolean)

  if (host === 'instagram.com' && parts[0] !== undefined && !['p', 'reel', 'explore'].includes(parts[0])) {
    return { platform: 'Instagram', value: parts[0], label: `@${parts[0].replace(/^@/, '')}` }
  }
  if (host === 'tiktok.com' && parts[0]?.startsWith('@')) {
    return { platform: 'TikTok', value: parts[0].slice(1), label: parts[0] }
  }
  if ((host === 'reddit.com' || host === 'old.reddit.com') && parts[0]?.toLowerCase() === 'r' && parts[1] !== undefined) {
    return { platform: 'Reddit Community', value: parts[1], label: `r/${parts[1]}` }
  }
  if (host === 'twitch.tv' && parts[0] !== undefined && !['directory', 'search', 'videos'].includes(parts[0])) {
    return { platform: 'Twitch', value: parts[0], label: `twitch.tv/${parts[0]}` }
  }
  if (host === 'threads.net' && parts[0]?.startsWith('@')) {
    return { platform: 'Threads', value: parts[0].slice(1), label: parts[0] }
  }
  if (host.endsWith('.slack.com')) {
    const workspace = host.slice(0, -'.slack.com'.length)
    return { platform: 'Slack', value: workspace, label: `${workspace}.slack.com` }
  }
  return undefined
}

/** Classify matching URLs already returned by the single Deep web search. */
export function classifyManualDiscovery(
  candidate: string,
  hits: readonly SearchHit[],
): Partial<Record<ManualPlatformName, DiscoveryMatch[]>> {
  const target = normalize(candidate)
  const found: Partial<Record<ManualPlatformName, DiscoveryMatch[]>> = {}

  for (const hit of hits) {
    let url: URL
    try {
      url = new URL(hit.url)
    } catch {
      continue
    }
    const item = identity(url)
    if (item === undefined) continue

    const normalizedIdentity = normalize(item.value)
    const similarity = compareNames(target, item.value).overall
    const brandExtension = normalizedIdentity.startsWith(target) && target.length >= 4
    if (normalizedIdentity !== target && !brandExtension && similarity < 70) continue

    const entries = found[item.platform] ?? []
    if (entries.some((entry) => entry.url === url.href) || entries.length >= 3) continue
    entries.push({
      label: item.label,
      url: url.href,
      ...(hit.content.trim() === '' ? {} : { snippet: hit.content.slice(0, 500) }),
    })
    found[item.platform] = entries
  }

  return found
}
