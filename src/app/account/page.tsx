import { redirect } from 'next/navigation'
import Link from 'next/link'
import { DeleteAccountForm } from '@/components/DeleteAccountForm'
import { currentUser } from '@/lib/db/auth'
import { isDatabaseConfigured } from '@/lib/db/client'

export const metadata = {
  title: 'Account | NameVetta',
  description: 'Export your data or delete your account.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function Page() {
  if (!isDatabaseConfigured()) redirect('/')

  const user = await currentUser()
  if (user === undefined) redirect('/auth')

  return (
    <div className="mx-auto w-full max-w-[560px] px-6 py-14">
      <div className="text-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-charcoal">
          Account settings
        </h1>
        <p className="mt-2 text-charcoal-2">
          Signed in as <span className="font-medium text-charcoal">{user.email}</span>
        </p>
      </div>

      <div className="mt-8 rounded-xl border border-line bg-surface p-6">
        <h2 className="font-semibold">Export your data</h2>
        <p className="mt-1.5 text-sm text-charcoal-2">
          Every scan, saved name and share link on your account, as one JSON file. See the{' '}
          <Link href="/privacy" className="text-accent underline underline-offset-2">
            Privacy Policy
          </Link>{' '}
          for exactly what that includes.
        </p>
        <a
          href="/api/account/export"
          className="mt-4 inline-block rounded-lg border border-line-strong px-4 py-2 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
        >
          Download my data
        </a>
      </div>

      <div className="mt-6 rounded-xl border border-danger/20 bg-danger-soft p-6">
        <h2 className="font-semibold text-danger">Delete account</h2>
        <p className="mt-1.5 text-sm text-danger/90">
          Permanently deletes your account and everything attached to it: every scan, saved name
          and share link. This cannot be undone. Consider exporting your data first.
        </p>
        <div className="mt-4">
          {user.email === undefined ? (
            <p className="text-sm text-danger/90">
              This account has no email on file, so the confirmation step below cannot run.
              Contact support to delete it instead.
            </p>
          ) : (
            <DeleteAccountForm email={user.email} />
          )}
        </div>
      </div>
    </div>
  )
}
