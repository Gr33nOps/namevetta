import Link from 'next/link'
import { VettaPanel } from '@/components/VettaPanel'
import { SourceLogo } from '@/components/SourceLogo'

export const metadata = { alternates: { canonical: '/' }, openGraph: { url: '/' } }

export default function Page() {
  return (
    <div className="page-shell">
      <section className="grid items-center gap-8 py-3 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12 lg:py-12">
        <div>
          <p className="mb-4 text-sm font-medium text-accent-ink">Name research</p>
          <h1 className="max-w-lg text-[36px] leading-[1.12] font-semibold tracking-tight sm:text-[46px]">Check a name before you make it yours.</h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-charcoal-2">See existing uses across domains, social handles, businesses, and apps. Know what needs a closer look.</p>
          <Link href="/how-it-works" className="mt-5 inline-flex min-h-11 items-center text-sm font-medium text-charcoal underline decoration-line-strong underline-offset-4">How the checks work <span aria-hidden="true" className="ml-2">→</span></Link>
        </div>
        <div id="search" className="min-w-0">
          <VettaPanel showResearchOptions />
          <p className="mt-3 text-center text-xs text-faint">No account needed for your first check.</p>
        </div>
      </section>
      <section className="mt-8 flex flex-col gap-4 border-y border-line py-6 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-base font-semibold">Still working on the name?</h2><p className="mt-1 text-sm text-charcoal-2">Start with a short brief and explore checked name ideas.</p></div>
        <Link href="/generate" className="btn-secondary shrink-0 self-start px-4 py-2 text-sm sm:self-auto">Find name ideas <span aria-hidden="true">→</span></Link>
      </section>
      <section className="pt-8" aria-label="Some of the places we research">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
          <p className="text-xs text-faint">A few of our sources</p>
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-charcoal-2">
            {['GitHub', 'YouTube', 'Reddit', 'App Store', 'npm', 'Steam'].map(label => <span key={label} className="inline-flex items-center gap-1.5"><SourceLogo label={label} size="sm" />{label}</span>)}
          </div>
        </div>
        <p className="mt-6 max-w-2xl text-xs leading-relaxed text-faint">Some sources need a manual check. Results show what we could verify and what remains uncertain.</p>
      </section>
    </div>
  )
}
