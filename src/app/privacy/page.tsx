import Link from 'next/link'
import { env } from '@/lib/env'

export const metadata = {
  title: 'Privacy Policy — NameVetta',
  description: 'What NameVetta collects, why, and how to get it back or delete it.',
}

const UPDATED = '2026-08-18'

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="font-display text-lg font-semibold text-charcoal">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-charcoal-2">{children}</div>
    </section>
  )
}

export default function Page() {
  const contact = env().CONTACT_EMAIL

  return (
    <div className="mx-auto w-full max-w-[720px] px-6 py-14">
      <p className="font-mono text-[10px] uppercase tracking-widest text-faint">Legal</p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-charcoal">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-faint">Last updated {UPDATED}</p>

      <p className="mt-6 text-sm leading-relaxed text-charcoal-2">
        This describes exactly what NameVetta collects, exactly who it is shared with and why, and
        how to get your data back or delete it. Where something isn&rsquo;t built yet, that is
        stated plainly rather than promised.
      </p>

      <div className="mt-10 space-y-8">
        <Section id="guests" title="1. If you never create an account">
          <p>
            NameVetta works fully without an account. To enforce a daily research limit and to
            show you your own history, requests are tracked using a one-way identifier derived
            from your IP address — a keyed hash (HMAC-SHA256 under a server-side secret), not the
            address itself. That secret makes the hash impossible to reverse back to an IP without
            it, unlike a plain hash of an IPv4 address, which is small enough to brute-force in
            minutes. Nothing about a guest is linked to an email address, a name, or any other
            identifier, because there isn&rsquo;t one to link.
          </p>
        </Section>

        <Section id="accounts" title="2. If you create an account">
          <p>
            An account stores an email address and a password (handled by our authentication
            provider, Supabase Auth — we never see or store your password in plain text), plus
            whatever you choose to save: your scan history, saved names, and any share links you
            generate. That&rsquo;s the complete list; there is no additional profile data collected
            beyond what you enter to sign up.
          </p>
        </Section>

        <Section id="research-data" title="3. What a search itself contains">
          <p>
            The name and optional description you research are stored so your history and reports
            work, and are sent to the sources that research them — see the next section for
            exactly which ones and what they receive. A share link exposes the score, category and
            headline figures of one report to anyone holding its link; it never exposes your
            account, your other searches, or how you were identified.
          </p>
        </Section>

        <Section id="third-parties" title="4. Who your search is sent to">
          <p>
            Only the name and description you are researching are ever sent onward — never your
            account email, password, or IP address. Each source below receives a search query
            (the candidate name, and for web search, your description) and nothing else about you:
          </p>
          <ul className="ml-5 list-disc space-y-1.5">
            <li><strong className="font-medium text-charcoal">GitHub, npm, PyPI, YouTube, Apple App Store, Wikidata, SEC EDGAR, UK Companies House</strong> — public read-only registries and search APIs, queried directly with the name.</li>
            <li><strong className="font-medium text-charcoal">Tavily</strong> — powers general web and Google Play research. Receives the name and, for a Deep Check, your description.</li>
            <li><strong className="font-medium text-charcoal">Groq</strong> — generates the optional AI explanation on a Deep Check report from a compact summary of what was already found. It never receives your account information.</li>
          </ul>
          <p>
            Two infrastructure providers host the service itself rather than researching anything:
            <strong className="font-medium text-charcoal"> Supabase</strong> (account data and
            research history, hosted in the US) and{' '}
            <strong className="font-medium text-charcoal">Vercel</strong> (application hosting).
            If you are outside the United States, your data is processed there as a result.
          </p>
          <p>None of the above are permitted to use what they receive to advertise to you, and none of them are ad networks or analytics platforms — NameVetta doesn&rsquo;t run any of its own, either.</p>
        </Section>

        <Section id="cookies" title="5. Cookies">
          <p>
            The only cookies set are the session cookies our authentication provider (Supabase)
            uses to keep you signed in. There is no advertising, tracking, or analytics cookie on
            this service.
          </p>
        </Section>

        <Section id="retention" title="6. How long data is kept">
          <p>
            Account and research data is kept until you delete it. There is currently no automatic
            expiry — stated plainly because promising one that doesn&rsquo;t exist would be worse
            than not having it. You can delete an individual search from your{' '}
            <Link href="/history" className="text-accent underline underline-offset-2">
              history
            </Link>{' '}
            at any time, and delete your account entirely, along with everything attached to it,
            from{' '}
            <Link href="/account" className="text-accent underline underline-offset-2">
              account settings
            </Link>
            .
          </p>
        </Section>

        <Section id="rights" title="7. Your rights">
          <p>
            From{' '}
            <Link href="/account" className="text-accent underline underline-offset-2">
              account settings
            </Link>{' '}
            you can export everything stored about you as a single file, or permanently delete
            your account and everything attached to it. Both take effect immediately — deletion is
            not reversible. If you use the service as a guest, deleting an individual search from
            your history removes it the same way; there is no account to delete.
          </p>
        </Section>

        <Section id="security" title="8. Security">
          <p>
            Account and research data is protected by row-level security in the database: a
            signed-in user can only ever read their own rows, enforced by the database itself
            rather than by application code remembering to filter. A shared report is reachable
            only through its own unguessable link, and revoking that link makes it unreachable
            immediately.
          </p>
        </Section>

        <Section id="children" title="9. Children">
          <p>
            NameVetta is not directed at children and is not knowingly used to collect data from
            anyone under 13.
          </p>
        </Section>

        <Section id="changes" title="10. Changes">
          <p>
            If this policy changes in a way that matters, the date at the top of this page will
            change. Continued use after that means you accept the update.
          </p>
        </Section>

        <Section id="contact" title="11. Contact">
          <p>
            {contact === undefined ? (
              <>This deployment has not configured a public contact address.</>
            ) : (
              <>
                Questions about this policy, or a request to export or delete your data, can be
                sent to{' '}
                <a href={`mailto:${contact}`} className="text-accent underline underline-offset-2">
                  {contact}
                </a>
                .
              </>
            )}
          </p>
        </Section>
      </div>
    </div>
  )
}
