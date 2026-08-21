import { Fragment } from 'react'
import { VettaPanel } from '@/components/VettaPanel'
import { quotaPhrase } from '@/lib/core/quota'
import { effectiveLimits } from '@/lib/quota'

/**
 * The catalog, and what a search of it actually asks.
 *
 * Three numbers, not one. The page used to print the catalog size beside the
 * words "checked on every search", which described neither a Quick Check
 * (which asks fewer) nor the truth about the ones that only run when the
 * category calls for them.
 */
/**
 * The homepage's own canonical, which used to come from the root layout.
 *
 * Declaring it at the root meant every private, noindex route inherited it.
 * The title and description still come from the layout; only the identity of
 * this particular URL is stated here.
 */
export const metadata = {
  alternates: { canonical: '/' },
  openGraph: { url: '/' },
}

/**
 * The five kinds of place a check covers, for the line above the headline.
 *
 * Set as terms with hairline rules between them rather than as one string of
 * middle dots. Five nouns run together read as a single grey smear at 12px;
 * separated, they read as five things, which is the only reason the line is
 * there. There used to be a green dot in front of them, borrowed from a status
 * indicator, saying nothing about a page where nothing has been checked yet.
 */
const COVERAGE_TERMS = ['Domains', 'Handles', 'Packages', 'Registers', 'App stores'] as const

/**
 * What gets checked.
 *
 * Every line here is a claim about the product, so every line is one the
 * engine actually backs. The trademark card in particular says what this does
 * (hands you the registries to search) rather than what a checker in this
 * space usually claims (that it screened them for you), because it doesn't.
 */
/**
 * The homepage.
 *
 * The search box is the page. Everything under it exists for somebody who has
 * not decided yet, and is ordered the way they ask: what do you check, how
 * does it work, and then the box again.
 */
export default function Page() {
  const { guest } = effectiveLimits()

  return (
    <>
      {/* ── hero ──────────────────────────────────────────────────────── */}
      <section className="animate-rise mx-auto max-w-6xl px-6 pt-12 pb-8 text-center sm:pt-16">
        {/*
          Five words, not five controls.

          This was a bordered pill with a shadow and a filled background, which
          is the exact recipe for a segmented button group — and every term in
          it looked clickable when none of them is. It is a caption above a
          headline, so it is set as one.
        */}
        <p className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11.5px] tracking-wide text-faint uppercase sm:text-[12px]">
          {COVERAGE_TERMS.map((term, i) => (
            <Fragment key={term}>
              {i === 0 ? null : (
                <span aria-hidden="true" className="h-2.5 w-px shrink-0 bg-line" />
              )}
              <span>{term}</span>
            </Fragment>
          ))}
        </p>

        <h1 className="font-display mx-auto mt-7 max-w-5xl text-[2.5rem] leading-[1.04] font-semibold text-charcoal sm:text-[3.5rem]">
          See where a name is <span className="brand-gradient-text brand-hero-shimmer">already</span> in use.
        </h1>

        <p className="mx-auto mt-4 max-w-[36rem] text-[15.5px] leading-relaxed text-charcoal-2 sm:text-[17px]">
          Domains, handles, packages, registers, and app stores.
        </p>
      </section>

      {/* ── the box ───────────────────────────────────────────────────── */}
      <section id="search" className="animate-rise mx-auto max-w-3xl px-6 pb-16" style={{ animationDelay: '80ms' }}>
        <VettaPanel showResearchOptions />
        <p className="mt-4 text-center text-[13px] text-faint">
          Free, no account, {quotaPhrase('quick', guest.quick)} a day.
        </p>
      </section>

    </>
  )
}
