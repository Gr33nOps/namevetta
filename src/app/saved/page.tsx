import Link from 'next/link'
import { SavedList } from '@/components/SavedList'
import { currentUser } from '@/lib/db/auth'
import { isDatabaseConfigured } from '@/lib/db/client'
import { savedNames } from '@/lib/db/history'

export const metadata = {
  title: 'Saved names — NameVetta',
  description: 'Names you are still considering.',
}

export const dynamic = 'force-dynamic'

export default async function Page() {
  const user = isDatabaseConfigured() ? await currentUser() : undefined

  if (user === undefined) {
    return (
      <div className="mx-auto w-full max-w-[600px] px-6 py-14">
        <p className="font-mono text-[10px] uppercase tracking-widest text-faint">Saved</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">
          Sign in to save names
        </h1>
        <p className="mt-3 text-charcoal-2">
          A saved list needs an account. Guest identity is derived from your network, so it
          would not survive you moving between them.
        </p>
        <Link
          href="/auth"
          className="mt-6 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Create a free account
        </Link>
      </div>
    )
  }

  const names = await savedNames(user.id)

  return (
    <div className="mx-auto w-full max-w-[720px] px-6 py-14">
      <p className="font-mono text-[10px] uppercase tracking-widest text-faint">Saved</p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">
        Names you are considering
      </h1>
      <p className="mt-2 text-charcoal-2">Saving and viewing never uses your daily allowance.</p>

      <div className="mt-8">
        <SavedList names={names} />
      </div>
    </div>
  )
}
