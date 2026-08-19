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
import { blueskyAdapter } from '@/lib/sources/bluesky'
import { companiesHouseAdapter } from '@/lib/sources/companies_house'
import { cratesIoAdapter } from '@/lib/sources/crates_io'
import { dockerHubAdapter } from '@/lib/sources/docker_hub'
import { domainAdapter } from '@/lib/sources/domain'
import { edgarAdapter } from '@/lib/sources/edgar'
import { flathubAdapter } from '@/lib/sources/flathub'
import { frEntreprisesAdapter } from '@/lib/sources/fr_entreprises'
import { githubAdapter } from '@/lib/sources/github'
import { gleifAdapter } from '@/lib/sources/gleif'
import { homebrewAdapter } from '@/lib/sources/homebrew'
import { npmAdapter } from '@/lib/sources/npm'
import { nugetAdapter } from '@/lib/sources/nuget'
import { osmAdapter } from '@/lib/sources/osm'
import { playStoreAdapter } from '@/lib/sources/play_store'
import { pypiAdapter } from '@/lib/sources/pypi'
import { rubygemsAdapter } from '@/lib/sources/rubygems'
import { socialCheckAdapter } from '@/lib/sources/social_check'
import { socialsAdapter } from '@/lib/sources/socials'
import { webAdapter } from '@/lib/sources/web'
import { wikidataAdapter } from '@/lib/sources/wikidata'
import { youtubeAdapter } from '@/lib/sources/youtube'

export const ADAPTERS: Partial<Record<SourceId, SourceAdapter>> = {
  domain: domainAdapter,
  github: githubAdapter,
  npm: npmAdapter,
  pypi: pypiAdapter,
  crates_io: cratesIoAdapter,
  rubygems: rubygemsAdapter,
  nuget: nugetAdapter,
  docker_hub: dockerHubAdapter,
  homebrew: homebrewAdapter,
  youtube: youtubeAdapter,
  app_store: appStoreAdapter,
  flathub: flathubAdapter,
  wikidata: wikidataAdapter,
  edgar: edgarAdapter,
  socials: socialsAdapter,
  social_check: socialCheckAdapter,
  web: webAdapter,
  play_store: playStoreAdapter,
  companies_house: companiesHouseAdapter,
  fr_entreprises: frEntreprisesAdapter,
  gleif: gleifAdapter,
  osm: osmAdapter,
  bluesky: blueskyAdapter,
}

export function adapterFor(id: SourceId): SourceAdapter | undefined {
  return ADAPTERS[id]
}
