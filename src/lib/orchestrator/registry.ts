/**
 * Adapter registry.
 *
 * The single place a source is wired in. A source present in the manifest but
 * absent here is reported as unimplemented rather than silently skipped — a
 * skipped source would quietly inflate coverage, which is the failure this
 * product exists to avoid.
 */
import type { SourceAdapter } from '@/lib/core/adapter'
import type { SourceId } from '@/lib/core/types'
import { appStoreAdapter } from '@/lib/sources/app_store'
import { domainAdapter } from '@/lib/sources/domain'
import { edgarAdapter } from '@/lib/sources/edgar'
import { githubAdapter } from '@/lib/sources/github'
import { npmAdapter } from '@/lib/sources/npm'
import { pypiAdapter } from '@/lib/sources/pypi'
import { socialsAdapter } from '@/lib/sources/socials'
import { wikidataAdapter } from '@/lib/sources/wikidata'
import { youtubeAdapter } from '@/lib/sources/youtube'

export const ADAPTERS: Partial<Record<SourceId, SourceAdapter>> = {
  domain: domainAdapter,
  github: githubAdapter,
  npm: npmAdapter,
  pypi: pypiAdapter,
  youtube: youtubeAdapter,
  app_store: appStoreAdapter,
  wikidata: wikidataAdapter,
  edgar: edgarAdapter,
  socials: socialsAdapter,
}

export function adapterFor(id: SourceId): SourceAdapter | undefined {
  return ADAPTERS[id]
}
