import { ResetPasswordForm } from '@/components/ResetPasswordForm'

export const metadata = {
  title: 'Reset password | NameVetta',
  description: 'Set a new password for your account.',
}

/**
 * Reached from the link in a password-reset email. Supabase exchanges the
 * link's token for a recovery session via the client-side auth helper before
 * this form ever submits, so the page itself just needs the new-password
 * form — no token handling here.
 */
export default function Page() {
  return (
    <div className="mx-auto w-full max-w-[420px] px-6 py-14">
      <div className="text-center">
        <p className="font-mono text-[11px] uppercase tracking-widest text-faint">Account</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-charcoal">
          Set a new password
        </h1>
        <p className="mt-3 text-charcoal-2">
          Choose a new password for your account.
        </p>
      </div>

      <div className="mt-8">
        <ResetPasswordForm />
      </div>
    </div>
  )
}
