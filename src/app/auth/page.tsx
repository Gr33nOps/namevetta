import { redirect } from 'next/navigation'
import { AuthForm } from '@/components/AuthForm'
import { currentUser } from '@/lib/db/auth'

export const metadata = {
  title: 'Sign in | NameVetta',
  description: 'Sign in to keep your research history and raise your daily allowance.',
}

const BENEFITS = [
  {
    title: '25 Quick Checks and 5 Deep Research runs a day',
    detail: 'Up from 5 and 1 as a guest.',
  },
  {
    title: 'History that follows you',
    detail: 'Every scan, saved and searchable from any device.',
  },
  {
    title: 'Save and compare names',
    detail: 'Keep a shortlist and revisit it whenever you need to.',
  },
  {
    title: 'Share reports privately',
    detail: 'Send a read-only link to a cofounder or client.',
  },
] as const

export default async function Page() {
  // Already signed in? There is nothing here for them.
  if ((await currentUser()) !== undefined) redirect('/history')

  return (
    <div className="mx-auto w-full max-w-[900px] px-6 py-14">
      <div className="md:grid md:grid-cols-[1fr_400px] md:items-start md:gap-16">
        <div className="max-w-md">
          <p className="font-mono text-[11px] uppercase tracking-widest text-faint">Account</p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-charcoal sm:text-4xl">
            Keep your research
          </h1>
          <p className="mt-3 text-lg leading-relaxed text-charcoal-2">
            One free account raises your daily allowance and keeps everything you research.
          </p>

          <ul className="mt-8 space-y-5">
            {BENEFITS.map((b) => (
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
