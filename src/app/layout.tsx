import type { Metadata } from 'next'
import Link from 'next/link'
import { JetBrains_Mono, Geist } from 'next/font/google'
import { SiteMark } from '@/components/SiteMark'
import { SiteNav } from '@/components/SiteNav'
import { BRAND_LINKS } from '@/lib/brand'
import { SCOPE_NOTICE } from '@/lib/presentation'
import { SITE_URL } from '@/lib/site'
import './globals.css'

/**
 * The face everything is set in.
 *
 * Outfit carried the headlines and Inter carried everything dense, on the
 * argument that a neutral face keeps a long results page scannable. Outfit is
 * legible enough at small sizes to hold both, so it holds both.
 *
 * The full weight range is loaded because the display sizes want 800 and 900
 * while body copy wants 400 and 500.
 */
const outfit = Geist({
  variable: '--font-geist',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
})

/**
 * The second face, and the only one with a job Outfit cannot do.
 *
 * Everything the product looks up is a literal string somebody will retype:
 * a domain, a handle, a package name. Set in the body face, `rn` and `m` and
 * `l` and `I` are guesses. Two weights only — this face never sets a heading.
 */
const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
})

const TITLE = 'NameVetta: check a name before you build on it'
const DESCRIPTION =
  'See where a name is already in use across domains, code, apps, social platforms, and the web.'

export const metadata: Metadata = {
  /**
   * Every URL-based metadata field below is relative, and Next resolves those
   * against `metadataBase`. Without it the fallback is `VERCEL_URL` — the
   * per-deployment hostname, which changes on every push — so a shared report's
   * OG image would point at a preview URL rather than the canonical site.
   */
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  icons: {
    icon: [{ url: '/icon.png', type: 'image/png', sizes: '256x256' }],
    apple: [{ url: '/apple-icon.png', type: 'image/png', sizes: '180x180' }],
  },
  /*
    No `alternates.canonical` here, and no `openGraph.url`.

    Next merges page metadata over the layout's, so anything set at the root is
    inherited by every route that does not override it — and the private routes
    do not: `/auth`, `/auth/reset`, `/history` and `/saved` all declare
    `robots: noindex` and nothing else. They were each shipping
    `<link rel="canonical" href="https://namevetta.vercel.app">`, telling a
    crawler that four unrelated private pages *are* the homepage while also
    telling it not to index them. Contradictory metadata is worse than none.

    Every public route sets its own canonical, including the homepage below.
    A page that does not want to be indexed now says nothing about its
    canonical identity, which is the honest answer.
  */
  openGraph: {
    type: 'website',
    siteName: 'NameVetta',
    title: TITLE,
    description: DESCRIPTION,
  },
  // `summary_large_image` rather than `summary`: the card is a 1200x630
  // render of the actual score and coverage figures, which is only legible
  // at the large size.
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
}

/**
 * The chrome colour, created by the bootstrap script and by nothing else.
 *
 * `theme-color` tints mobile browser chrome to match the page behind it, and
 * the script below has to write it before first paint — otherwise a phone set
 * to dark draws a white bar over a black page for a frame. That requirement is
 * incompatible with React rendering the tag, in either of the two ways it
 * could:
 *
 *   - `export const viewport = { themeColor }`, which is how this used to work;
 *   - a literal `<meta>` in the JSX below, which was tried next.
 *
 * Both produce the same bug. React 19 treats `<meta>` as hoistable and will
 * not adopt a DOM node whose attributes something else has changed, so on
 * hydration it inserts a second one — leaving two tags with different values,
 * the last of which wins. The page renders dark and the chrome goes light,
 * intermittently, depending which side of hydration you look at.
 *
 * So React does not render it at all. The script creates the element, owns it,
 * and `ThemeToggle` updates the same one later. A browser with JavaScript off
 * gets no tag and the default chrome, which is the correct degradation for
 * something that is decoration on a colour it cannot know.
 *
 * Still one tag rather than two behind `prefers-color-scheme` media
 * attributes: that would tie the chrome to the *system* setting while the page
 * follows the visitor's own choice, so a phone set to light with the site
 * toggled to dark would draw a white bar above a black page.
 */
const CHROME_DARK = '#111316'
const CHROME_LIGHT = '#f8f9fb'

/**
 * Theme, before first paint.
 *
 * This runs synchronously in `<head>`, ahead of anything rendering, because
 * the alternative is a white page for one frame in front of somebody who
 * asked for dark.
 *
 * A stored choice is attached to the script-owned `theme-color` meta node,
 * which CSS can read without changing a React-owned `<html>` attribute before
 * hydration. With no stored choice, `color-scheme: light dark` lets the CSS
 * follow the system on its own, which needs no JavaScript at all. The chrome
 * colour is a separate
 * question and gets set either way — a visitor on a dark phone who has never
 * touched the toggle still renders dark, so a `theme-color` left at the light
 * default would draw a white bar over a black page.
 *
 * Wrapped in try/catch because `localStorage` throws outright in a browser
 * with site data blocked, and a theme preference is not worth a blank page.
 * Kept to one line for the same reason it is inline: it blocks the parser.
 */
const THEME_BOOTSTRAP = `try{var t=localStorage.getItem('nv-theme'),c=t==='light'||t==='dark',d=c?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches,m=document.createElement('meta');m.name='theme-color';m.content=d?'${CHROME_DARK}':'${CHROME_LIGHT}';if(c)m.dataset.nvTheme=t;document.head.appendChild(m)}catch(e){}`

/**
 * Structured data. Static, and deliberately modest: this describes what the
 * product is and that it costs nothing, and claims nothing about accuracy or
 * scope that the report itself doesn't already state.
 */
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'NameVetta',
  url: SITE_URL,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Any',
  description: DESCRIPTION,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
}

/**
 * One line, not three columns.
 *
 * These are the pages a person visits once, if ever. Giving them a grid of
 * headings implied there was a site to explore; there isn't, there's a search
 * box and an answer.
 */
const FOOTER_LINKS = [
  { href: '/how-it-works', label: 'How it works' },
  { href: '/status', label: 'Source status' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: BRAND_LINKS.githubShowcase, label: 'GitHub showcase', external: true },
  { href: BRAND_LINKS.support, label: 'Support', external: true },
] as const

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${outfit.variable} ${jetbrainsMono.variable} h-full`}>
      <head>
        {/*
          No `<meta name="theme-color">` here, on purpose. The script below
          creates it — see the comment on CHROME_LIGHT.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
        />
      </head>
      <body className="relative flex min-h-full flex-col overflow-x-hidden font-sans">
        {/*
          The wash behind every page, and the only decoration in the app.

          Fixed rather than scrolled: a report runs long, and a glow anchored
          to the top of the document leaves the header sitting on flat white
          two screens down. It is also what makes the glass in the header and
          around the search box read as glass — a pane over one flat colour is
          just a pale rectangle.

          It carries no meaning, so it is not announced, and `print:hidden`
          keeps it off paper.
        */}

        {/*
          First focusable element on every page. A report runs long, so without
          this a keyboard user re-tabs the whole nav on every navigation.
        */}
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-100 focus:rounded-xl focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>
        <div aria-hidden="true" className="glass-atmosphere print:hidden" />
        <SiteNav />
        <main id="content" className="relative z-10 flex-1">
          {children}
        </main>

        <footer className="relative z-10 border-t border-line bg-surface print:hidden">
          <div className="mx-auto flex w-full max-w-[1088px] flex-col gap-5 px-5 py-7 sm:flex-row sm:items-start sm:justify-between sm:px-6">
            <SiteMark size="sm" />

            <div className="flex flex-col gap-2 sm:items-end">
              <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
                {FOOTER_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    {...('external' in link && link.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                    className="inline-flex min-h-8 items-center rounded text-[13px] text-faint transition-colors hover:text-charcoal-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
              <span className="max-w-[46ch] text-[12px] leading-relaxed text-faint sm:max-w-none sm:text-right">
                {SCOPE_NOTICE}
              </span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
