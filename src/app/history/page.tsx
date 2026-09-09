import Link from 'next/link'
import { HistoryList } from '@/components/HistoryList'
import { PageHeader } from '@/components/PageHeader'
import { currentUser } from '@/lib/db/auth'
import { isDatabaseConfigured } from '@/lib/db/client'
import { recentScans } from '@/lib/db/history'

export const metadata = {
  title: 'History | NameVetta',
  description: 'Your past name research and its findings.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/**
 * Research history.
 *
 * Stored history requires a verified account. IP hashes identify quota buckets,
 * not people. Viewing history never
 * consumes allowance — only fresh research does — which is why nothing on this
 * page touches the quota beyond reading it.
 */
export default async function Page() {
  const user = await currentUser()
  if (user === undefined) {
    return (
      <div className="page-shell">
        <PageHeader title="Research history">Sign in to view your research.</PageHeader>
        <div className="panel mt-8 rounded-2xl p-6 text-center sm:p-10">
          <p className="text-charcoal-2">Your history is private to your account.</p>
          <Link href="/auth?next=/history" className="btn-primary mt-5 min-h-11 px-5 py-3 text-sm">Sign in</Link>
        </div>
      </div>
    )
  }
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

  const entries = await recentScans({ type: 'user', id: user.id })

  return (
    <div className="page-shell">
      <PageHeader title="Research history" action={<Link href="/" className="btn-secondary px-4 py-2 text-sm">Check a name</Link>}>
          Your saved research.
      </PageHeader>

      <div className="mt-8">
        <HistoryList entries={entries} />
      </div>
    </div>
  )
}
