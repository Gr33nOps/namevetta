/** Public Hugging Face Hub search. Results are discovery, never availability. */
import { z } from 'zod'
import type { DiscoveryMatch } from '@/lib/core/types'
import { publicDiscoveryAdapter } from '@/lib/sources/public-discovery'
import { normalize } from '@/lib/similarity/normalize'
import { compareNames, containsNameAsWord } from '@/lib/similarity/score'

const ResponseSchema = z.array(z.object({ id: z.string().min(1), author: z.string().optional() }))

export const huggingFaceAdapter = publicDiscoveryAdapter({
  source: 'huggingface',
  provider: 'Hugging Face',
  appliesTo: ['saas', 'developer_tool'],
  notApplicableMessage: 'Hugging Face is searched for software and developer-tool names only.',
  endpoint: (name) => `https://huggingface.co/api/models?search=${encodeURIComponent(name)}&limit=10`,
  schema: ResponseSchema,
  items: (data) => data,
  match: (item, context, normalizedName): DiscoveryMatch | undefined => {
    const modelName = item.id.split('/').at(-1) ?? item.id
    const similarity = compareNames(context.name, modelName).overall
    const relevant = normalize(modelName) === normalizedName || containsNameAsWord(context.name, modelName) || similarity >= 70
    if (!relevant) return undefined
    return {
      label: item.id,
      url: `https://huggingface.co/${item.id.split('/').map(encodeURIComponent).join('/')}`,
      ...(item.author === undefined ? {} : { snippet: `Published by ${item.author}` }),
    }
  },
  searchUrl: (name) => `https://huggingface.co/models?search=${encodeURIComponent(name)}`,
  detail: 'Check public model names directly.',
})
