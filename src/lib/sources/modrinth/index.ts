/** Public Modrinth project search. Results are discovery, never availability. */
import { z } from 'zod'
import type { DiscoveryMatch } from '@/lib/core/types'
import { publicDiscoveryAdapter } from '@/lib/sources/public-discovery'
import { normalize } from '@/lib/similarity/normalize'
import { compareNames, containsNameAsWord } from '@/lib/similarity/score'

const ResponseSchema = z.object({
  hits: z.array(z.object({
    project_id: z.string().min(1),
    title: z.string().min(1),
    slug: z.string().nullable().optional(),
    description: z.string().optional(),
    project_type: z.string().min(1),
  })),
})

export const modrinthAdapter = publicDiscoveryAdapter({
  source: 'modrinth',
  provider: 'Modrinth',
  appliesTo: ['game'],
  notApplicableMessage: 'Modrinth is searched for game names only.',
  endpoint: (name) => `https://api.modrinth.com/v2/search?query=${encodeURIComponent(name)}&limit=10`,
  schema: ResponseSchema,
  items: (data) => data.hits,
  match: (item, context, normalizedName): DiscoveryMatch | undefined => {
    const similarity = compareNames(context.name, item.title).overall
    const relevant = normalize(item.title) === normalizedName || containsNameAsWord(context.name, item.title) || similarity >= 70
    if (!relevant) return undefined
    const identifier = item.slug ?? item.project_id
    return {
      label: item.title,
      url: `https://modrinth.com/${item.project_type}/${encodeURIComponent(identifier)}`,
      ...(item.description === undefined || item.description.trim() === '' ? {} : { snippet: item.description.slice(0, 500) }),
    }
  },
  searchUrl: (name) => `https://modrinth.com/mods?q=${encodeURIComponent(name)}`,
  detail: 'Check project names directly.',
})
