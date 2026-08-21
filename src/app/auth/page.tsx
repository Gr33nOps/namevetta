import { redirect } from 'next/navigation'
import { AuthForm } from '@/components/AuthForm'
import { currentUser } from '@/lib/db/auth'

export const metadata = {
  title: 'Sign in | NameVetta',
  description: 'Sign in to keep research history across devices.',
  robots: { index: false, follow: false },
}

/** Keep the account benefits specific without turning the sign-in page into a rate card. */
function benefitsFor() {
  return [
  {
    title: 'More daily research',
    detail: 'A higher allowance for checks and ideas.',
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
  const benefits = benefitsFor()

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

      <div className="mx-auto mt-10 w-full max-w-[520px]">
        <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-center">
          {benefits.map((b) => (
            <li key={b.title} className="inline-flex items-center gap-1.5 text-xs text-charcoal-2">
              <span aria-hidden="true" className="text-ok">✓</span>
              <span>{b.title}</span>
            </li>
          ))}
        </ul>

        <div className="mt-7">
          {confirmationFailed ? (
            <p role="alert" className="mb-3 rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger">
              That confirmation link could not sign you in. Request a new link or sign in below.
            </p>
          ) : null}
          <AuthForm
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
