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
import { anacondaAdapter } from '@/lib/sources/anaconda'
import { behanceAdapter } from '@/lib/sources/behance'
import { cocoapodsAdapter } from '@/lib/sources/cocoapods'
import { codebergAdapter } from '@/lib/sources/codeberg'
import { cpanAdapter } from '@/lib/sources/cpan'
import { denoAdapter } from '@/lib/sources/deno'
import { dribbbleAdapter } from '@/lib/sources/dribbble'
import { fdroidAdapter } from '@/lib/sources/f_droid'
import { gravatarAdapter } from '@/lib/sources/gravatar'
import { hackageAdapter } from '@/lib/sources/hackage'
import { hackerNewsAdapter } from '@/lib/sources/hacker_news'
import { mavenCentralAdapter } from '@/lib/sources/maven_central'
import { pubDevAdapter } from '@/lib/sources/pub_dev'
import { snapStoreAdapter } from '@/lib/sources/snap_store'
import { soundcloudAdapter } from '@/lib/sources/soundcloud'
import { terraformAdapter } from '@/lib/sources/terraform'
import { vimeoAdapter } from '@/lib/sources/vimeo'
import { wordpressPluginsAdapter } from '@/lib/sources/wordpress_plugins'
import { aboutMeAdapter } from '@/lib/sources/about_me'
import { bitbucketAdapter } from '@/lib/sources/bitbucket'
import { chocolateyAdapter } from '@/lib/sources/chocolatey'
import { dailymotionAdapter } from '@/lib/sources/dailymotion'
import { flickrAdapter } from '@/lib/sources/flickr'
import { goModulesAdapter } from '@/lib/sources/go_modules'
import { linktreeAdapter } from '@/lib/sources/linktree'
import { patreonAdapter } from '@/lib/sources/patreon'
import { slackAdapter } from '@/lib/sources/slack'
import { xTwitterAdapter } from '@/lib/sources/x_twitter'
import { cranAdapter } from '@/lib/sources/cran'
import { firefoxAddonsAdapter } from '@/lib/sources/firefox_addons'
import { hexAdapter } from '@/lib/sources/hex'
import { itchIoAdapter } from '@/lib/sources/itch_io'
import { packagistAdapter } from '@/lib/sources/packagist'
import { steamAdapter } from '@/lib/sources/steam'
import { vscodeMarketplaceAdapter } from '@/lib/sources/vscode_marketplace'
import { socialCheckAdapter } from '@/lib/sources/social_check'
import { socialsAdapter } from '@/lib/sources/socials'
import { webAdapter } from '@/lib/sources/web'
import { wikidataAdapter } from '@/lib/sources/wikidata'
import { youtubeAdapter } from '@/lib/sources/youtube'
import { aurAdapter } from '@/lib/sources/aur'
import { huggingFaceAdapter } from '@/lib/sources/huggingface'
import { modrinthAdapter } from '@/lib/sources/modrinth'
import { robloxAdapter } from '@/lib/sources/roblox'

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
  packagist: packagistAdapter,
  hex: hexAdapter,
  cran: cranAdapter,
  vscode_marketplace: vscodeMarketplaceAdapter,
  firefox_addons: firefoxAddonsAdapter,
  steam: steamAdapter,
  itch_io: itchIoAdapter,
  pub_dev: pubDevAdapter,
  cocoapods: cocoapodsAdapter,
  wordpress_plugins: wordpressPluginsAdapter,
  anaconda: anacondaAdapter,
  hackage: hackageAdapter,
  deno: denoAdapter,
  cpan: cpanAdapter,
  terraform: terraformAdapter,
  snap_store: snapStoreAdapter,
  maven_central: mavenCentralAdapter,
  codeberg: codebergAdapter,
  vimeo: vimeoAdapter,
  gravatar: gravatarAdapter,
  dribbble: dribbbleAdapter,
  behance: behanceAdapter,
  soundcloud: soundcloudAdapter,
  hacker_news: hackerNewsAdapter,
  f_droid: fdroidAdapter,
  x_twitter: xTwitterAdapter,
  bitbucket: bitbucketAdapter,
  linktree: linktreeAdapter,
  about_me: aboutMeAdapter,
  flickr: flickrAdapter,
  dailymotion: dailymotionAdapter,
  slack: slackAdapter,
  patreon: patreonAdapter,
  chocolatey: chocolateyAdapter,
  go_modules: goModulesAdapter,
  web: webAdapter,
  play_store: playStoreAdapter,
  companies_house: companiesHouseAdapter,
  fr_entreprises: frEntreprisesAdapter,
  gleif: gleifAdapter,
  osm: osmAdapter,
  bluesky: blueskyAdapter,
  aur: aurAdapter,
  roblox: robloxAdapter,
  modrinth: modrinthAdapter,
  huggingface: huggingFaceAdapter,
}

export function adapterFor(id: SourceId): SourceAdapter | undefined {
  return ADAPTERS[id]
}
