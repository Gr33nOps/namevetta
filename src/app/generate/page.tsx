import { GenerateRunner } from '@/components/GenerateRunner'

export const metadata = {
  title: 'Generate names | NameVetta',
  description: 'Generate candidate names, research every one, and see the strongest 5.',
  alternates: { canonical: '/generate' },
  openGraph: {
    title: 'Generate names | NameVetta',
    description: 'Generate candidate names, research every one, and see the strongest 5.',
    url: '/generate',
  },
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
      <div className="text-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-charcoal sm:text-4xl">
          Don&rsquo;t have a name yet?
        </h1>

        <p className="mx-auto mt-3 max-w-2xl text-lg leading-relaxed text-charcoal-2">
          Describe what you&rsquo;re building. We&rsquo;ll generate candidate names, research every
          one, and show you the strongest 5 that survived.
        </p>
      </div>

      <div className="mt-8">
        <GenerateRunner />
      </div>
    </div>
  )
}
