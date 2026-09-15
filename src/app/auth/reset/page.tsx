import { ResetPasswordForm } from '@/components/ResetPasswordForm'
import { connection } from 'next/server'
import { PageHeader } from '@/components/PageHeader'

export const metadata = {
  title: 'Reset password | NameVetta',
  description: 'Choose a new account password.',
  robots: { index: false, follow: false },
}

/**
 * Rendered per request, never prerendered.
 *
 * With no dynamic data of its own this page was statically optimised, and a
 * static page on Vercel is served from the edge with a public, long-lived
 * cache policy. That is the wrong posture for a step in a password-reset
 * flow, however little the HTML itself gives away. The `Cache-Control` header
 * in `next.config.ts` is the belt; this is the braces.
 */
/**
 * Reached from the link in a password-reset email. Supabase exchanges the
 * link's token for a recovery session via the client-side auth helper before
 * this form ever submits, so the page itself just needs the new-password
 * form — no token handling here.
 */
export default async function Page() {
  await connection()

  return (
    <div className="page-shell max-w-[488px]">
      <PageHeader title="Set a new password" />

      <div className="mt-8">
        <ResetPasswordForm />
      </div>
    </div>
  )
}
