import Link from 'next/link'
import { LegalPage, LegalSection } from '@/components/LegalPage'
import { env } from '@/lib/env'

export const metadata = {
  title: 'Privacy Policy | NameVetta',
  description: 'What is stored, where searches go, and your choices.',
  alternates: { canonical: '/privacy' },
  openGraph: {
    title: 'Privacy Policy | NameVetta',
    description: 'What is stored, where searches go, and your choices.',
    url: '/privacy',
  },
}

const UPDATED = '2026-08-18'

export default function Page() {
  const contact = env().CONTACT_EMAIL

  return (
    <LegalPage
      title="Privacy"
      updated={UPDATED}
      lead="What we store, where research goes, and your choices."
    >
      <LegalSection title="What's stored">
        <p>
          You can check names without an account. History requires sign-in. To enforce a daily
          limit, guest requests use a one-way identifier derived from the IP address: a
          keyed hash (HMAC-SHA256 under a server-side secret), not the address itself. That secret
          is what makes it impossible to reverse without it, unlike a plain hash of an IPv4
          address, which is small enough to brute-force in minutes. Nothing about a guest is linked
          to an email or a name, because there isn&rsquo;t one to link.
        </p>
        <p>
          An account stores an email and a password (handled by Supabase Auth; we never see or
          store your password in plain text), plus whatever you choose to keep: your history, saved
          names, and any share links you create. That is the complete list. No profile data is
          collected beyond what you enter to sign up.
        </p>
        <p>
          The name and optional description you research are stored so history and reports work,
          and are sent to the sources that research them. A share link exposes the score, category
          and headline figures of one report to whoever holds it, and never your account, your
          other searches, or how you were identified.
        </p>
        <p>
          The only cookies set are the session cookies Supabase uses to keep you signed in. There
          is no advertising, tracking or analytics cookie on this service.
        </p>
      </LegalSection>

      <LegalSection title="Where your search goes">
        <p>
          Only the name and description being researched are ever sent onward, never your email,
          password or IP address. Each source receives a search query and nothing else about you:
        </p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            <strong className="font-medium text-charcoal">
              GitHub, npm, PyPI, YouTube, Apple App Store, Wikidata, SEC EDGAR, UK Companies House
            </strong>{' '}
            and the other public registries: read-only lookups, queried directly with the name.
          </li>
          <li>
            <strong className="font-medium text-charcoal">Tavily</strong> powers general web and
            Google Play research. It receives the name and, on a Deep Check, your description.
          </li>
          <li>
            <strong className="font-medium text-charcoal">Groq</strong> writes the optional AI
            explanation on a Deep Check, from a compact summary of what was already found. It never
            receives your account information.
          </li>
        </ul>
        <p>
          Two providers host the service rather than researching anything:{' '}
          <strong className="font-medium text-charcoal">Supabase</strong> (account data and history,
          hosted in the US) and <strong className="font-medium text-charcoal">Vercel</strong>{' '}
          (application hosting). If you are outside the United States, your data is processed there
          as a result.
        </p>
        <p>
          None of them are permitted to use what they receive to advertise to you, and none is an ad
          network or an analytics platform. This service doesn&rsquo;t run any of its own either.
        </p>
      </LegalSection>

      <LegalSection title="Exporting or deleting data">
        <p>
          Data is kept until you delete it. There is no automatic expiry, which is stated plainly
          because promising one that doesn&rsquo;t exist would be worse than not having it.
        </p>
        <p>
          From{' '}
          <Link href="/account" className="text-accent-ink underline underline-offset-2">
            account settings
          </Link>{' '}
          you can export everything stored about you as a single file, or permanently delete your
          account and everything attached to it. Both take effect immediately, and deletion cannot
          be undone. Individual searches can be removed from your{' '}
          <Link href="/history" className="text-accent-ink underline underline-offset-2">
            history
          </Link>{' '}
          at any time. As a guest, deleting a search works the same way; there is no account to
          delete.
        </p>
      </LegalSection>

      <LegalSection title="Security">
        <p>
          Account and research data is protected by row-level security in the database: a signed-in
          user can only ever read their own rows, enforced by the database itself rather than by
          application code remembering to filter. A shared report is reachable only through its own
          unguessable link, and revoking that link makes it unreachable immediately.
        </p>
      </LegalSection>

      <LegalSection title="Children, changes and contact">
        <p>
          This service is not directed at children and is not knowingly used to collect data from
          anyone under 13.
        </p>
        <p>
          If this policy changes in a way that matters, the date above changes with it. Continued
          use after that means you accept the update.
        </p>
        <p>
          {contact === undefined ? (
            <>This deployment has not configured a public contact address.</>
          ) : (
            <>
              Questions, or a request to export or delete your data, can go to{' '}
              <a href={`mailto:${contact}`} className="text-accent-ink underline underline-offset-2">
                {contact}
              </a>
              .
            </>
          )}
        </p>
      </LegalSection>
    </LegalPage>
  )
}
