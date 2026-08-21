import { ResetPasswordForm } from '@/components/ResetPasswordForm'
import { connection } from 'next/server'

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
    <div className="mx-auto w-full max-w-[420px] px-6 py-14">
      <div className="text-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-charcoal">
          Set a new password
        </h1>
        <p className="mt-3 text-charcoal-2">
          Choose a new password.
        </p>
      </div>

      <div className="mt-8">
        <ResetPasswordForm />
      </div>
    </div>
  )
}
