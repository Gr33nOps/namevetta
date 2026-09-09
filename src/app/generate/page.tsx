import { GenerateRunner } from '@/components/GenerateRunner'
import { effectiveLimits } from '@/lib/quota'
import { PageHeader } from '@/components/PageHeader'

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
    <div className="page-shell max-w-[840px]">
      <PageHeader title="Find a name that fits.">Describe your idea. Explore names that suit it, with checks on where they&rsquo;re already used.</PageHeader>
      <div>
        <GenerateRunner
          guestGenerateLimit={limits.guest.generate}
          userGenerateLimit={limits.user.generate}
        />
      </div>
    </div>
  )
}
