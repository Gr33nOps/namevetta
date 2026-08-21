import { GenerateRunner } from '@/components/GenerateRunner'
import { effectiveLimits } from '@/lib/quota'

export const metadata = {
  title: 'Generate names | NameVetta',
  description: 'Generate name ideas and research the strongest five.',
  alternates: { canonical: '/generate' },
  openGraph: {
    title: 'Generate names | NameVetta',
    description: 'Generate name ideas and research the strongest five.',
    url: '/generate',
  },
}

/**
 * The name generator (§12).
 *
 * Generate a small pool, Quick Check each option, and return the top 5. The
 * generation step is AI, but nothing reaches this page's result without
 * having been through the same Quick Check every standalone search uses —
 * an invented name is a starting point, not a claim.
 */
export default function Page() {
  const limits = effectiveLimits()

  return (
    <div className="mx-auto w-full max-w-5xl px-6 pt-12 pb-16 sm:pt-16">
      <div className="animate-rise text-center">
        <h1 className="font-display text-[2.5rem] leading-[1.04] font-semibold text-charcoal sm:text-[3.5rem]">
          Find names that <span className="brand-gradient-text brand-hero-shimmer">fit</span>.
        </h1>

        <p className="mx-auto mt-5 max-w-[36rem] text-[15.5px] leading-relaxed text-charcoal-2 sm:text-[17px]">
          Tell us what you&rsquo;re naming. We&rsquo;ll research the best five.
        </p>
      </div>

      <div className="animate-rise mt-10" style={{ animationDelay: '80ms' }}>
        <GenerateRunner
          guestGenerateLimit={limits.guest.generate}
          userGenerateLimit={limits.user.generate}
        />
      </div>
    </div>
  )
}
