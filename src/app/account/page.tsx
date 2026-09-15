import { redirect } from 'next/navigation'
import Link from 'next/link'
import { DeleteAccountForm } from '@/components/DeleteAccountForm'
import { SignOutButton } from '@/components/SignOutButton'
import { PageHeader } from '@/components/PageHeader'
import { BRAND_LINKS } from '@/lib/brand'
import { currentUser } from '@/lib/db/auth'
import { isDatabaseConfigured } from '@/lib/db/client'
import { recentScans, savedNames } from '@/lib/db/history'
import { limitsFor, remainingQuota } from '@/lib/db/quota'

export const metadata = {
  title: 'Account | NameVetta',
  description: 'Manage your NameVetta account and research.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function Page() {
  if (!isDatabaseConfigured()) redirect('/')

  const user = await currentUser()
  if (user === undefined) redirect('/auth')

  const subject = { type: 'user' as const, id: user.id }
  const limits = limitsFor(subject)
  const [remaining, scans, saved] = await Promise.all([
    remainingQuota(subject),
    recentScans(subject),
    savedNames(user.id),
  ])

  return (
    <div className="page-shell">
      <PageHeader title="Account" action={<SignOutButton />}><span className="break-all">{user.email ?? 'Signed in'}</span></PageHeader>
      <div>
        <section className="mt-8">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-xl font-semibold">Today&rsquo;s research</h2>
            <p className="text-sm text-faint">Resets daily</p>
          </div>
          <div className="mt-3 grid grid-cols-3 overflow-hidden rounded-2xl border border-line bg-surface">
            {[
              { label: 'Quick', remaining: remaining.quick, limit: limits.quick },
              { label: 'Deep', remaining: remaining.deep, limit: limits.deep },
              { label: 'Ideas', remaining: remaining.generate, limit: limits.generate },
            ].map((usage, index) => (
              <div key={usage.label} className={`p-4 sm:p-5 ${index === 0 ? '' : 'border-l border-line'}`}>
                <p className="font-mono text-xl font-semibold tracking-tight sm:text-2xl">
                  {usage.remaining}<span className="ml-1 text-sm font-normal text-charcoal-2">left</span>
                </p>
                <p className="mt-1 text-sm text-charcoal-2">{usage.label} {usage.label === 'Ideas' ? 'runs' : 'checks'}</p>
                <p className="mt-0.5 text-xs text-faint">of {usage.limit} today</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="font-display text-xl font-semibold">Your research</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Link href="/history" className="card group rounded-2xl p-5 transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <p className="font-mono text-2xl font-semibold">{scans.length}</p>
              <h3 className="mt-2 font-semibold group-hover:text-accent-ink">Research history</h3>
              <p className="mt-1 text-sm text-charcoal-2">Open saved reports.</p>
            </Link>
            <Link href="/saved" className="card group rounded-2xl p-5 transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <p className="font-mono text-2xl font-semibold">{saved.length}</p>
              <h3 className="mt-2 font-semibold group-hover:text-accent-ink">Saved names</h3>
              <p className="mt-1 text-sm text-charcoal-2">Keep a shortlist.</p>
            </Link>
          </div>
        </section>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <section className="card rounded-2xl p-5">
            <h2 className="font-semibold">Your data</h2>
            <p className="mt-1.5 text-sm text-charcoal-2">
              Download scans, saved names, and share links as JSON.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a href="/api/account/export" className="btn-secondary rounded-xl px-4 py-2 text-sm">
                Download data
              </a>
              <Link href="/privacy" className="inline-flex items-center text-sm text-accent-ink underline underline-offset-2">
                Privacy
              </Link>
            </div>
          </section>

          <section className="card rounded-2xl p-5">
            <h2 className="font-semibold">Help improve NameVetta</h2>
            <p className="mt-1.5 text-sm text-charcoal-2">
              Support more research sources or follow the public showcase.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a href={BRAND_LINKS.support} target="_blank" rel="noreferrer" className="btn-primary rounded-xl px-4 py-2 text-sm">
                Support
              </a>
              <a href={BRAND_LINKS.githubShowcase} target="_blank" rel="noreferrer" className="inline-flex items-center text-sm text-accent-ink underline underline-offset-2">
                GitHub showcase
              </a>
            </div>
          </section>
        </div>

        <details className="mt-8 rounded-2xl border border-danger/20 bg-danger-soft px-5 py-4">
          <summary className="cursor-pointer list-none font-semibold text-danger marker:content-none">
            Delete account
          </summary>
          <p className="mt-3 text-sm text-danger/90">
            Deletes your account, scans, saved names, and share links. This can&rsquo;t be undone.
          </p>
          <div className="mt-4">
            {user.email === undefined ? (
              <p className="text-sm text-danger/90">
                This account has no email on file. Use Support to request deletion.
              </p>
            ) : (
              <DeleteAccountForm email={user.email} />
            )}
          </div>
        </details>
      </div>
    </div>
  )
}
