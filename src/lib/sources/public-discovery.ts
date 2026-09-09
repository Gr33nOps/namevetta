/** Shared contract for public search results that are evidence, not availability checks. */
import { z } from 'zod'
import type { AdapterDeps, SourceAdapter } from '@/lib/core/adapter'
import type { Category, ScanContext } from '@/lib/core/scan'
import type { DiscoveryMatch, SourceId, SourceResult } from '@/lib/core/types'
import { requestJson } from '@/lib/sources/http'
import { buildResult, makeEvidence, requestFailure, unverifiable } from '@/lib/sources/result'
import { normalize } from '@/lib/similarity/normalize'

interface PublicDiscoveryConfig<TData, TItem> {
  source: SourceId
  provider: string
  appliesTo: readonly Category[]
  notApplicableMessage: string
  endpoint: (name: string) => string
  schema: z.ZodType<TData>
  items: (data: TData) => readonly TItem[]
  match: (item: TItem, context: ScanContext, normalizedName: string) => DiscoveryMatch | undefined
  searchUrl: (name: string) => string
  detail: string
}

/**
 * Search a provider whose public index can surface useful leads, but cannot
 * honestly decide name availability. Every completed result stays manual.
 */
export function publicDiscoveryAdapter<TData, TItem>(config: PublicDiscoveryConfig<TData, TItem>): SourceAdapter {
  return {
    id: config.source,

    async run(context: ScanContext, deps: AdapterDeps): Promise<SourceResult> {
      if (!context.includeSpecialized && !config.appliesTo.includes(context.category)) {
        return unverifiable(config.source, 'NOT_APPLICABLE', config.notApplicableMessage, false)
      }

      const normalizedName = normalize(context.name)
      if (normalizedName === '') return unverifiable(config.source, 'INVALID_NAME', 'Name contains no usable characters.', false)

      let data: TData
      try {
        const response = await requestJson<unknown>(config.endpoint(context.name), { signal: deps.signal, retries: 1 })
        const parsed = config.schema.safeParse(response.data)
        if (!parsed.success) return unverifiable(config.source, 'MALFORMED_RESPONSE', `${config.provider} returned an unexpected response.`, false)
        data = parsed.data
      } catch (cause) {
        return requestFailure(config.source, config.provider, cause)
      }

      const discovery = config.items(data)
        .map((item) => config.match(item, context, normalizedName))
        .filter((item): item is DiscoveryMatch => item !== undefined)
        .slice(0, 5)
      const searchUrl = config.searchUrl(context.name)

      deps.log(`${config.source}.searched`, { matches: discovery.length })
      return buildResult({
        source: config.source,
        status: 'manual_check_recommended',
        evidence: [makeEvidence(config.source, `Search ${config.provider} for "${context.name}"`, searchUrl)],
        meta: {
          platforms: [{
            name: config.provider,
            url: searchUrl,
            status: 'manual_check_recommended',
            detail: config.detail,
            discoveryChecked: true,
            ...(discovery.length === 0 ? {} : { discovery }),
          }],
        },
      })
    },
  }
}
