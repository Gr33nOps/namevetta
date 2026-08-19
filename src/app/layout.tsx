import type { Metadata } from 'next'
import Link from 'next/link'
import { Inter, JetBrains_Mono, Outfit } from 'next/font/google'
import { SiteNav } from '@/components/SiteNav'
import { SCOPE_NOTICE } from '@/lib/presentation'
import './globals.css'

const jetbrains = JetBrains_Mono({ variable: '--font-jetbrains', subsets: ['latin'] })
// Two typefaces split by role, not by "brand vs body" the way a
// serif+sans pairing would: Outfit carries the hero headline, page
// titles and score numerals, where its geometric character is the
// point. Inter carries everything dense — nav, buttons, badges, evidence
// rows — where a neutral, highly-legible face keeps a long results page
// scannable instead of every label competing for the same attention.
const outfit = Outfit({
  variable: '--font-outfit',
  subsets: ['latin'],
  weight: ['600', '700', '800', '900'],
})
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'NameVetta: research a name before you build on it',
  description:
    'Check how crowded a name is across GitHub, app stores, domains and more. Evidence-backed results, not just a row of green checkmarks.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${inter.variable} ${jetbrains.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        {/* Runs before paint so an explicit theme choice never flashes the other palette first. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('nv-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="flex min-h-full flex-col font-sans">
        <SiteNav />
        <main className="flex-1">{children}</main>

        <footer className="border-t border-line bg-surface">
          <div className="mx-auto w-full max-w-[1200px] px-6 py-10">
            <div className="flex flex-wrap gap-x-16 gap-y-8">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-faint">
                  Product
                </p>
                <ul className="mt-3 space-y-2 text-sm">
                  <li>
                    <Link href="/" className="text-charcoal-2 transition-colors hover:text-charcoal">
                      New Check
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/generate"
                      className="text-charcoal-2 transition-colors hover:text-charcoal"
                    >
                      Generate
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/compare"
                      className="text-charcoal-2 transition-colors hover:text-charcoal"
                    >
                      Compare
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/history"
                      className="text-charcoal-2 transition-colors hover:text-charcoal"
                    >
                      History
                    </Link>
                  </li>
                </ul>
              </div>

              <div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-faint">Legal</p>
                <ul className="mt-3 space-y-2 text-sm">
                  <li>
                    <Link
                      href="/terms"
                      className="text-charcoal-2 transition-colors hover:text-charcoal"
                    >
                      Terms
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/privacy"
                      className="text-charcoal-2 transition-colors hover:text-charcoal"
                    >
                      Privacy
                    </Link>
                  </li>
                </ul>
              </div>
            </div>

            <p className="mt-8 border-t border-line pt-6 text-xs leading-relaxed text-faint">
              {SCOPE_NOTICE} Nothing here is legal advice.
            </p>
          </div>
        </footer>
      </body>
    </html>
  )
}
