import { headers } from 'next/headers'
import Link from 'next/link'
import { HistoryList } from '@/components/HistoryList'
import { currentUser } from '@/lib/db/auth'
import { isDatabaseConfigured } from '@/lib/db/client'
import { recentScans } from '@/lib/db/history'
import { identifySubject } from '@/lib/db/identity'
import { limitsFor, remainingQuota } from '@/lib/db/quota'

export const metadata = {
  title: 'History | NameVetta',
  description: 'Every name you have researched, with its evidence.',
}

export const dynamic = 'force-dynamic'

/**
 * Research history.
 *
 * Works signed out: a guest's own scans are keyed to their salted hash, so they
 * get history without an account. §31 is explicit that viewing history never
 * consumes allowance — only fresh research does — which is why nothing on this
 * page touches the quota beyond reading it.
 */
export default async function Page() {
  if (!isDatabaseConfigured()) {
    return (
      <div className="mx-auto w-full max-w-[860px] px-6 py-14 text-center">
        <h1 className="font-display text-3xl font-semibold">History unavailable</h1>
        <p className="mt-3 text-charcoal-2">
          This deployment has no database configured, so research is not stored. Everything else
          works.
        </p>
      </div>
    )
  }

  const user = await currentUser()
  const subject = identifySubject(await headers(), user?.id)
  const entries = subject === undefined ? [] : await recentScans(subject)
  const remaining = subject === undefined ? undefined : await remainingQuota(subject)
  const limits = subject === undefined ? undefined : limitsFor(subject)

  return (
    <div className="mx-auto w-full max-w-[860px] px-6 py-14">
      <div className="text-center">
        <p className="font-mono text-[11px] uppercase tracking-widest text-faint">History</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">
          {user === undefined ? 'Your research' : `Welcome back, ${user.displayName}`}
        </h1>
        <p className="mt-2 text-charcoal-2">
          {user === undefined
            ? 'Kept on this device. Create an account to keep it anywhere and raise your allowance.'
            : 'Everything you have researched.'}
        </p>

        {remaining !== undefined && limits !== undefined ? (
          <div className="mx-auto mt-5 inline-flex items-center gap-4 rounded-xl border border-line bg-surface px-4 py-3">
            <p className="font-mono text-[11px] uppercase tracking-widest text-faint">
              Left today
            </p>
            <p className="text-sm">
              <span className="font-mono font-semibold">{remaining.quick}</span>
              <span className="text-faint">/{limits.quick} Quick</span>
            </p>
            <p className="text-sm">
              <span className="font-mono font-semibold">{remaining.deep}</span>
              <span className="text-faint">/{limits.deep} Deep</span>
            </p>
          </div>
        ) : null}
      </div>

      {user === undefined ? (
        <div className="mt-6 rounded-xl border border-accent-border bg-accent-soft p-4">
          <p className="text-sm text-accent">
            <Link href="/auth" className="font-medium underline underline-offset-2">
              Create a free account
            </Link>{' '}
            for 25 Quick Checks and 5 Deep Research runs a day, and history that follows you
            across devices.
          </p>
        </div>
      ) : null}

      <div className="mt-8">
        <HistoryList entries={entries} />
      </div>
    </div>
  )
}
