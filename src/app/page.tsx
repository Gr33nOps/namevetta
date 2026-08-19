import { SearchForm } from '@/components/SearchForm'
import { SCOPE_NOTICE } from '@/lib/presentation'

const VALUE_POINTS = [
  {
    number: '01',
    title: 'Similarity-aware',
    body: 'Finds similar spellings, phonetic matches and confusingly close names, not just exact hits.',
  },
  {
    number: '02',
    title: 'Evidence-backed',
    body: 'Every score is explained by real findings. See exactly what was checked and what was found.',
  },
  {
    number: '03',
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
      <section className="pb-20 pt-16 md:pb-24 md:pt-24">
        <div className="mx-auto w-full max-w-[640px] px-6">
          <div className="text-center">
            <h1 className="mb-5 font-display text-4xl font-extrabold leading-[1.05] tracking-tighter text-charcoal md:text-5xl lg:text-[58px]">
              Research a name
              <br />
              <span className="text-accent">before you build on it.</span>
            </h1>

            <p className="mb-4 text-lg leading-relaxed text-charcoal-2">
              Check how crowded a name is across domains, code registries, app stores, company
              registers, social handles and the open web. Evidence-backed, not a row of green
              checkmarks.
            </p>

            <p className="mb-10 text-sm text-faint">{SCOPE_NOTICE}</p>
          </div>

          <SearchForm autoFocus />

          <p className="mt-4 text-center text-sm text-faint">
            5 Quick Checks and 1 Deep Research per day as a guest, always free
          </p>
        </div>
      </section>

      <section className="border-t border-line bg-surface py-14">
        <div className="mx-auto w-full max-w-[900px] px-6">
          <div className="grid gap-8 divide-y divide-line text-center sm:grid-cols-3 sm:gap-6 sm:divide-y-0 sm:divide-x">
            {VALUE_POINTS.map((item) => (
              <div
                key={item.title}
                className="pt-6 first:pt-0 sm:px-6 sm:pt-0 sm:first:pl-0 sm:last:pr-0"
              >
                <span className="font-mono text-xs text-faint">{item.number}</span>
                <h2 className="mt-1 text-sm font-semibold text-charcoal">{item.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-charcoal-2">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
