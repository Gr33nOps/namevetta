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
import { companiesHouseAdapter } from '@/lib/sources/companies_house'
import { domainAdapter } from '@/lib/sources/domain'
import { edgarAdapter } from '@/lib/sources/edgar'
import { githubAdapter } from '@/lib/sources/github'
import { npmAdapter } from '@/lib/sources/npm'
import { playStoreAdapter } from '@/lib/sources/play_store'
import { pypiAdapter } from '@/lib/sources/pypi'
import { socialsAdapter } from '@/lib/sources/socials'
import { webAdapter } from '@/lib/sources/web'
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
  web: webAdapter,
  play_store: playStoreAdapter,
  companies_house: companiesHouseAdapter,
}

export function adapterFor(id: SourceId): SourceAdapter | undefined {
  return ADAPTERS[id]
}
