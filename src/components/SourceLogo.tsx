import type { SimpleIcon } from 'simple-icons'
import {
  siAboutdotme,
  siAnaconda,
  siApachemaven,
  siApple,
  siAppstore,
  siArchlinux,
  siBehance,
  siBitbucket,
  siBluesky,
  siChocolatey,
  siCocoapods,
  siCodeberg,
  siDailymotion,
  siDart,
  siDeno,
  siDocker,
  siDribbble,
  siElixir,
  siFdroid,
  siFirefox,
  siFlickr,
  siFlathub,
  siGithub,
  siGo,
  siGoogle,
  siGoogleplay,
  siGravatar,
  siHaskell,
  siHomebrew,
  siHuggingface,
  siInstagram,
  siItchdotio,
  siLinktree,
  siModrinth,
  siNpm,
  siNuget,
  siOpenstreetmap,
  siPatreon,
  siPerl,
  siPhp,
  siPypi,
  siR,
  siReddit,
  siRoblox,
  siRubygems,
  siRust,
  siSoundcloud,
  siSnapcraft,
  siSteam,
  siTerraform,
  siThreads,
  siTiktok,
  siTwitch,
  siVimeo,
  siWikidata,
  siWordpress,
  siX,
  siYoutube,
} from 'simple-icons'

type LogoSize = 'sm' | 'md' | 'lg'

const ICONS: Record<string, SimpleIcon | undefined> = {
  About: siAboutdotme,
  'About.me': siAboutdotme,
  Anaconda: siAnaconda,
  Apple: siApple,
  'App Store': siAppstore,
  'Arch User Repository': siArchlinux,
  Behance: siBehance,
  Bitbucket: siBitbucket,
  Bluesky: siBluesky,
  Chocolatey: siChocolatey,
  'CocoaPods': siCocoapods,
  Codeberg: siCodeberg,
  'DailyMotion': siDailymotion,
  Deno: siDeno,
  'Docker Hub': siDocker,
  Dribbble: siDribbble,
  'Hex (Elixir)': siElixir,
  'F-Droid': siFdroid,
  'Firefox Add-ons': siFirefox,
  Flickr: siFlickr,
  Flathub: siFlathub,
  GitHub: siGithub,
  'Go Modules': siGo,
  Google: siGoogle,
  'Google Play': siGoogleplay,
  Gravatar: siGravatar,
  'Hackage': siHaskell,
  Homebrew: siHomebrew,
  'Hugging Face': siHuggingface,
  Instagram: siInstagram,
  'itch.io': siItchdotio,
  Linktree: siLinktree,
  Modrinth: siModrinth,
  'Maven Central': siApachemaven,
  npm: siNpm,
  NuGet: siNuget,
  'Local business (OpenStreetMap)': siOpenstreetmap,
  Patreon: siPatreon,
  'Packagist (PHP)': siPhp,
  'pub.dev': siDart,
  'CPAN': siPerl,
  PyPI: siPypi,
  'CRAN (R)': siR,
  Reddit: siReddit,
  'Reddit Community': siReddit,
  Roblox: siRoblox,
  RubyGems: siRubygems,
  'crates.io': siRust,
  SoundCloud: siSoundcloud,
  'Snap Store': siSnapcraft,
  Steam: siSteam,
  'Terraform Registry': siTerraform,
  Threads: siThreads,
  TikTok: siTiktok,
  Twitch: siTwitch,
  Vimeo: siVimeo,
  Wikidata: siWikidata,
  'WordPress Plugins': siWordpress,
  'X / Twitter': siX,
  YouTube: siYoutube,
}

const SIZE_CLASS: Record<LogoSize, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
}

function needsContrastSurface(hex: string) {
  const red = Number.parseInt(hex.slice(0, 2), 16)
  const green = Number.parseInt(hex.slice(2, 4), 16)
  const blue = Number.parseInt(hex.slice(4, 6), 16)
  return red * 0.299 + green * 0.587 + blue * 0.114 < 96
}

/**
 * A small brand mark for a checked source. Official marks come from
 * Simple Icons, which is CC0. Non-brand registry rows use a neutral initial
 * so the UI never invents an official logo for a service that has none.
 */
export function SourceLogo({ label, size = 'md' }: { label: string; size?: LogoSize }) {
  const icon = ICONS[label]

  if (icon === undefined) {
    return (
      <span
        aria-hidden="true"
        className={`inline-flex shrink-0 items-center justify-center rounded-md bg-accent-soft font-mono text-[9px] font-semibold text-accent-ink ${SIZE_CLASS[size]}`}
      >
        {label.slice(0, 1).toUpperCase()}
      </span>
    )
  }

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center ${SIZE_CLASS[size]} ${needsContrastSurface(icon.hex) ? 'rounded-[3px] bg-white/90 p-0.5' : ''}`}
    >
      <svg
        className="h-full w-full"
        viewBox="0 0 24 24"
        fill="currentColor"
        style={{ color: `#${icon.hex}` }}
      >
        <path d={icon.path} />
      </svg>
    </span>
  )
}
