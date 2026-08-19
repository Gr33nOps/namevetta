import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { Inter, Outfit } from 'next/font/google'
import { SiteNav } from '@/components/SiteNav'
import { SCOPE_NOTICE } from '@/lib/presentation'
import { SITE_URL } from '@/lib/site'
import './globals.css'

// Two typefaces split by role, not by "brand vs body" the way a
// serif+sans pairing would: Outfit carries the hero headline, page
// titles and score numerals, where its geometric character is the
// point. Inter carries everything dense — nav, buttons, badges, evidence
// rows — where a neutral, highly-legible face keeps a long results page
// scannable instead of every label competing for the same attention.
const outfit = Outfit({
  variable: '--font-outfit',
  subsets: ['latin'],
  weight: ['700', '800'],
})
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

const TITLE = 'NameVetta: research a name before you build on it'
const DESCRIPTION =
  'Check how crowded a name is across GitHub, app stores, domains and more. Evidence-backed results, not just a row of green checkmarks.'

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
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'NameVetta',
    title: TITLE,
    description: DESCRIPTION,
    url: '/',
  },
  // `summary_large_image` rather than `summary`: the card is a 1200x630
  // render of the actual score and coverage figures, which is only legible
  // at the large size.
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
}

/**
 * `themeColor` tints mobile browser chrome to match the page behind it. Both
 * values are the `--nv-canvas` literals from `globals.css`, per mode, so the
 * address bar tracks the theme the user actually chose.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafafc' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0b13' },
  ],
}

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
  { href: '/methodology', label: 'How it works' },
  { href: '/status', label: 'Source status' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
] as const

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${inter.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        {/* Runs before paint so an explicit theme choice never flashes the other palette first. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('nv-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}})();`,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
        />
      </head>
      <body className="flex min-h-full flex-col font-sans">
        {/*
          First focusable element on every page. The header is sticky and a
          report runs long, so without this a keyboard user re-tabs the whole
          nav on every navigation.
        */}
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>
        <SiteNav />
        <main id="content" className="flex-1">
          {children}
        </main>

        <footer className="border-t border-line bg-surface print:hidden">
          <div className="mx-auto flex w-full max-w-[880px] flex-wrap items-center justify-center gap-x-5 gap-y-2 px-5 py-7 text-center">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded text-[12.5px] text-faint transition-colors hover:text-charcoal-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {link.label}
              </Link>
            ))}
            <span className="w-full text-[12px] text-faint">{SCOPE_NOTICE}</span>
          </div>
        </footer>
      </body>
    </html>
  )
}
