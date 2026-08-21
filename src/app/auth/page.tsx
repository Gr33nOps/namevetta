import { redirect } from 'next/navigation'
import { AuthForm } from '@/components/AuthForm'
import { currentUser } from '@/lib/db/auth'
import { effectiveLimits } from '@/lib/quota'

export const metadata = {
  title: 'Sign in | NameVetta',
  description: 'Sign in to keep research history across devices.',
  robots: { index: false, follow: false },
}

/**
 * What an account is actually worth, in the configured numbers.
 *
 * Written out here the page once promised 25 and 5 while the server was
 * handing out 500 and 50, which is the kind of gap a reader notices on their
 * first refused scan. Both figures now come from the same configuration the
 * scan route enforces.
 */
function benefitsFor(limits: ReturnType<typeof effectiveLimits>) {
  return [
  {
    title: `${limits.user.quick} Quick · ${limits.user.deep} Deep · ${limits.user.generate} Generate`,
    detail: `Guest: ${limits.guest.quick} · ${limits.guest.deep} · ${limits.guest.generate}`,
  },
  {
    title: 'History across devices',
    detail: 'Keep your research.',
  },
  {
    title: 'Save names',
    detail: 'Save a shortlist.',
  },
  {
    title: 'Share reports',
    detail: 'Share read-only reports.',
  },
  ] as const
}

export default async function Page({ searchParams }: PageProps<'/auth'>) {
  // Already signed in? There is nothing here for them.
  if ((await currentUser()) !== undefined) redirect('/history')

  const query = await searchParams
  const confirmationFailed = query.error === 'confirmation'
  const limits = effectiveLimits()
  const benefits = benefitsFor(limits)

  return (
    <div className="mx-auto w-full max-w-[900px] px-6 py-14">
      {/*
        The header sits above both columns rather than on top of the left one.
        Every other page in the app opens with a centred title and lead, and
        this was the last one that did not — it opened flush left, level with a
        form card, and read as a different site. What is under it stays in two
        columns and stays left-aligned, because a bulleted list and a sign-in
        form are not title blocks.
      */}
      <header className="text-center">
        <h1 className="font-display text-3xl font-semibold text-charcoal sm:text-4xl">
          Keep your research
        </h1>
        <p className="mx-auto mt-4 max-w-[46ch] text-[17px] leading-relaxed text-charcoal-2">
          Save your research across devices.
        </p>
      </header>

      <div className="mt-12 md:grid md:grid-cols-[1fr_400px] md:items-start md:gap-16">
        <div className="max-w-md">
          <ul className="space-y-5">
            {benefits.map((b) => (
              <li key={b.title} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-ok-soft text-xs font-semibold text-ok"
                >
                  ✓
                </span>
                <div>
                  <p className="text-sm font-medium text-charcoal">{b.title}</p>
                  <p className="mt-0.5 text-sm text-charcoal-2">{b.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-10 md:mt-0">
          {confirmationFailed ? (
            <p role="alert" className="mb-3 rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger">
              That confirmation link could not sign you in. Request a new link or sign in below.
            </p>
          ) : null}
          <AuthForm
            guestLimits={limits.guest}
            turnstileSiteKey={
              process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY === ''
                ? undefined
                : process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
            }
          />
        </div>
      </div>
    </div>
  )
}
