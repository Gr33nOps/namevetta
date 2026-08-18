import type { Metadata } from 'next'
import { Fraunces, Inter, JetBrains_Mono } from 'next/font/google'
import { SiteNav } from '@/components/SiteNav'
import { SCOPE_NOTICE } from '@/lib/presentation'
import './globals.css'

const inter = Inter({ variable: '--font-inter', subsets: ['latin'] })
const jetbrains = JetBrains_Mono({ variable: '--font-jetbrains', subsets: ['latin'] })
const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  // Fraunces is variable across optical size; the display cut is what gives the
  // headline its high-contrast serif character.
  axes: ['SOFT', 'WONK'],
})

export const metadata: Metadata = {
  title: 'NameVetta — Research a name before you build on it',
  description:
    'Check how crowded a name is across GitHub, app stores, domains and more. Evidence-backed results — not just a row of green checkmarks.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrains.variable} ${fraunces.variable} h-full`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <SiteNav />
        <main className="flex-1">{children}</main>

        <footer className="border-t border-line bg-surface">
          <div className="mx-auto w-full max-w-[1200px] px-6 py-6">
            <p className="text-xs leading-relaxed text-faint">
              {SCOPE_NOTICE} Nothing here is legal advice.
            </p>
          </div>
        </footer>
      </body>
    </html>
  )
}
