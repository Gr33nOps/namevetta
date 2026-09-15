import Link from 'next/link'
import { SavedList } from '@/components/SavedList'
import { PageHeader } from '@/components/PageHeader'
import { currentUser } from '@/lib/db/auth'
import { isDatabaseConfigured } from '@/lib/db/client'
import { savedNames } from '@/lib/db/history'

export const metadata = {
  title: 'Saved names | NameVetta',
  description: 'Names you are still considering.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function Page() {
  const user = isDatabaseConfigured() ? await currentUser() : undefined

  if (user === undefined) {
    return (
      <div className="page-shell max-w-[840px]">
        <h1 className="font-display text-3xl font-semibold">
          Sign in to save names
        </h1>
        <p className="mt-3 text-charcoal-2">
          Saving a shortlist needs an account. Guest history stays on this device.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/auth"
            className="btn-primary rounded-xl px-4 py-2 text-sm"
          >
            Sign in
          </Link>
        </div>
      </div>
    )
  }

  const names = await savedNames(user.id)

  return (
    <div className="page-shell">
      <PageHeader title="Saved names" action={<Link href="/generate" className="btn-secondary px-4 py-2 text-sm">Find name ideas</Link>}>Your shortlist, ready for another look.</PageHeader>

      <div className="mt-8">
        <SavedList names={names} />
      </div>
    </div>
  )
}
