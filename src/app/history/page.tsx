import { headers } from 'next/headers'
import Link from 'next/link'
import { HistoryList } from '@/components/HistoryList'
import { PageHeader } from '@/components/PageHeader'
import { currentUser } from '@/lib/db/auth'
import { isDatabaseConfigured } from '@/lib/db/client'
import { recentScans } from '@/lib/db/history'
import { identifySubject } from '@/lib/db/identity'

export const metadata = {
  title: 'History | NameVetta',
  description: 'Your past name research and its findings.',
  robots: { index: false, follow: false },
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
          This deployment cannot save research yet.
        </p>
      </div>
    )
  }

  const user = await currentUser()
  const subject = identifySubject(await headers(), user?.id)
  const entries = subject === undefined ? [] : await recentScans(subject)

  return (
    <div className="page-shell">
      <PageHeader title="Research history" action={<Link href="/" className="btn-secondary px-4 py-2 text-sm">Check a name</Link>}>
          {user === undefined
            ? 'Saved on this device.'
            : 'Your saved research.'}
      </PageHeader>

      {user === undefined ? (
        <div className="mb-6 rounded-xl border border-line bg-surface px-4 py-3">
          <p className="text-sm text-charcoal-2">
            Keep this research across devices.{' '}
            <Link href="/auth" className="font-medium text-accent-ink underline underline-offset-2">
              Create an account
            </Link>
          </p>
        </div>
      ) : null}

      <div className="mt-8">
        <HistoryList entries={entries} />
      </div>
    </div>
  )
}
