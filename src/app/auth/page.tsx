import { redirect } from 'next/navigation'
import { AuthForm } from '@/components/AuthForm'
import { currentUser } from '@/lib/db/auth'

export const metadata = {
  title: 'Sign in — NameVetta',
  description: 'Sign in to keep your research history and raise your daily allowance.',
}

export default async function Page() {
  // Already signed in? There is nothing here for them.
  if ((await currentUser()) !== undefined) redirect('/history')

  return (
    <div className="mx-auto w-full max-w-[420px] px-6 py-14">
      <p className="font-mono text-[10px] uppercase tracking-widest text-faint">Account</p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-charcoal">
        Keep your research
      </h1>
      <p className="mt-3 text-charcoal-2">
        History, saved names, and a larger daily allowance.
      </p>

      <div className="mt-8">
        <AuthForm />
      </div>
    </div>
  )
}
