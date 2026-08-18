import { SearchForm } from '@/components/SearchForm'
import { SCOPE_NOTICE } from '@/lib/presentation'

const VALUE_POINTS = [
  {
    title: 'Similarity-aware',
    body: 'Finds similar spellings, phonetic matches and confusingly close names — not just exact hits.',
  },
  {
    title: 'Evidence-backed',
    body: 'Every score is explained by real findings. See exactly what was checked and what was found.',
  },
  {
    title: 'Honest about gaps',
    body: 'If a source cannot be verified, the report says so. Silence is never counted as good news.',
  },
]

/**
 * Homepage (§60).
 *
 * Positioned on what the answer is worth rather than how many sites we hit —
 * "we check 25 sources!" is a claim about us, not about the user's decision.
 */
export default function Page() {
  return (
    <div>
      <section className="relative overflow-hidden pb-20 pt-16 md:pb-24 md:pt-24">
        <div className="grid-canvas pointer-events-none absolute inset-0" aria-hidden="true" />

        <div className="relative mx-auto w-full max-w-[720px] px-6">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-charcoal-2 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden="true" />
            Free daily research · no sign-up required
          </p>

          <h1 className="mb-5 font-display text-4xl font-semibold leading-[1.06] tracking-tight text-charcoal md:text-5xl lg:text-[56px]">
            Research a name
            <br />
            <span className="text-accent">before you build on it.</span>
          </h1>

          <p className="mb-4 max-w-[540px] text-lg leading-relaxed text-charcoal-2">
            Check how crowded a name is across GitHub, app stores, domains and more.
            Evidence-backed results — not just a row of green checkmarks.
          </p>

          <p className="mb-10 max-w-[540px] text-sm text-faint">{SCOPE_NOTICE}</p>

          <SearchForm autoFocus />

          <p className="mt-4 text-center text-sm text-faint">
            5 Quick Checks · 1 Deep Research per day as guest — always free
          </p>
        </div>
      </section>

      <section className="border-t border-line bg-surface py-14">
        <div className="mx-auto w-full max-w-[900px] px-6">
          <div className="grid gap-8 sm:grid-cols-3">
            {VALUE_POINTS.map((item) => (
              <div key={item.title}>
                <h2 className="mb-1.5 text-sm font-semibold text-charcoal">{item.title}</h2>
                <p className="text-sm leading-relaxed text-charcoal-2">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
