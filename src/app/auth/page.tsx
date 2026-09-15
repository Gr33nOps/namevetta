import { redirect } from 'next/navigation'
import { AuthForm } from '@/components/AuthForm'
import { PageHeader } from '@/components/PageHeader'
import { currentUser } from '@/lib/db/auth'

export const metadata = {
  title: 'Sign in | NameVetta', description: 'Sign in to keep research history across devices.',
  robots: { index: false, follow: false },
}

export default async function Page({ searchParams }: PageProps<'/auth'>) {
  if ((await currentUser()) !== undefined) redirect('/history')
  const query = await searchParams
  return (
    <div className="page-shell max-w-[488px]">
      <PageHeader title="Sign in">Keep your saved names and reports across devices.</PageHeader>
      {query.error === 'confirmation' ? <p role="alert" className="mb-4 rounded-xl border border-danger/25 bg-danger-soft p-4 text-sm text-danger">That confirmation link could not sign you in. Request a new link or sign in below.</p> : null}
      <AuthForm turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || undefined} />
    </div>
  )
}
