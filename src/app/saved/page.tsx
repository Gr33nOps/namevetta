import Link from 'next/link'
import { SavedList } from '@/components/SavedList'
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
      <div className="mx-auto w-full max-w-[600px] px-6 py-14 text-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Sign in to save names
        </h1>
        <p className="mt-3 text-charcoal-2">
          Saving names needs an account. As a guest, your history only lives on this device — an
          account lets you save names and reach them from anywhere.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/auth"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Create a free account
          </Link>
          <Link
            href="/auth"
            className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-charcoal-2 transition-colors hover:border-accent hover:text-accent"
          >
            Sign in
          </Link>
        </div>
      </div>
    )
  }

  const names = await savedNames(user.id)

  return (
    <div className="mx-auto w-full max-w-[720px] px-6 py-14">
      <div className="text-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Names you are considering
        </h1>
        <p className="mt-2 text-charcoal-2">Saving and viewing never uses your daily allowance.</p>
      </div>

      <div className="mt-8">
        <SavedList names={names} />
      </div>
    </div>
  )
}
