import { GenerateRunner } from '@/components/GenerateRunner'

export const metadata = {
  title: 'Generate names — NameVetta',
  description: 'Generate candidate names, research every one, and see the strongest 5.',
}

/**
 * The name generator (§12).
 *
 * "Generate ~30, auto Quick Check, discard failures, return top 5." The
 * generation step is AI, but nothing reaches this page's result without
 * having been through the same Quick Check every standalone search uses —
 * an invented name is a starting point, not a claim.
 */
export default function Page() {
  return (
    <div className="mx-auto w-full max-w-[860px] px-6 py-14">
      <p className="font-mono text-[10px] uppercase tracking-widest text-faint">
        Generate names
      </p>

      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-charcoal sm:text-4xl">
        Don&rsquo;t have a name yet?
      </h1>

      <p className="mt-3 max-w-2xl text-lg leading-relaxed text-charcoal-2">
        Describe what you&rsquo;re building. We&rsquo;ll generate candidate names, research every
        one, and show you the strongest 5 that survived.
      </p>

      <div className="mt-8">
        <GenerateRunner />
      </div>
    </div>
  )
}
