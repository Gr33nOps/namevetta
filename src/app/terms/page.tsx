import Link from 'next/link'
import { LegalToc } from '@/components/LegalToc'
import { SCOPE_NOTICE, TRADEMARK_DISCLAIMER } from '@/lib/presentation'

export const metadata = {
  title: 'Terms of Service | NameVetta',
  description: 'The terms that govern using NameVetta.',
  alternates: { canonical: '/terms' },
  openGraph: {
    title: 'Terms of Service | NameVetta',
    description: 'The terms that govern using NameVetta.',
    url: '/terms',
  },
}

const UPDATED = '2026-08-18'

const SECTIONS = [
  { id: 'what-this-is', title: '1. What NameVetta is' },
  { id: 'accuracy', title: '2. No warranty on research results' },
  { id: 'accounts', title: '3. Accounts and guest use' },
  { id: 'acceptable-use', title: '4. Acceptable use' },
  { id: 'third-party', title: '5. Third-party sources' },
  { id: 'ip', title: '6. Ownership' },
  { id: 'liability', title: '7. Limitation of liability' },
  { id: 'changes', title: '8. Changes' },
  { id: 'contact', title: '9. Contact' },
] as const

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
      <h2 className="text-lg font-semibold text-charcoal">{title}</h2>
      <div className="mt-2 space-y-3 text-[15px] leading-[1.75] text-charcoal-2">{children}</div>
    </section>
  )
}

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-[720px] px-6 py-14">
      <div className="text-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-charcoal">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-faint">Last updated {UPDATED}</p>

        <p className="mx-auto mt-6 max-w-[640px] text-sm leading-[1.75] text-charcoal-2">
          These terms govern your use of NameVetta (&ldquo;the service&rdquo;). By using it, you
          agree to them. If you do not agree, do not use the service.
        </p>
      </div>

      <div className="mt-10 lg:flex lg:items-start lg:gap-12">
        <LegalToc items={SECTIONS} />
        <div className="max-w-[640px] space-y-8">
        <Section id="what-this-is" title="1. What NameVetta is">
          <p>
            NameVetta researches whether a name is already in use across domains, code
            registries, app stores, company registers and general web presence, and reports what
            it found with evidence you can check yourself.
          </p>
          <p className="rounded-lg border border-accent-border bg-accent-soft px-3 py-2 text-accent">
            {SCOPE_NOTICE} {TRADEMARK_DISCLAIMER}
          </p>
          <p>
            Nothing on this service is legal, trademark, business or professional advice of any
            kind. A clean report is not permission to use a name, and a conflict is not a legal
            determination that you cannot. Decisions about registering, launching or defending a
            name are yours, and you should get advice from a qualified professional (a trademark
            attorney, in most cases) before making them.
          </p>
        </Section>

        <Section id="accuracy" title="2. No warranty on research results">
          <p>
            Every result on this service comes from a specific, named source (GitHub, npm, the
            UK company register, and so on) and is presented with the evidence behind it. But
            those sources can be rate-limited, temporarily unavailable, incomplete, or simply
            wrong, and NameVetta reports that honestly rather than guessing. A source marked
            &ldquo;unable to verify&rdquo; or &ldquo;not checked&rdquo; means exactly that: we
            don&rsquo;t know, not that the name is free.
          </p>
          <p>
            Where an explanation is written by an AI model, it is generated only from the findings
            already shown on the same report and is checked against them before being shown to
            you. It can still be unavailable, wrong, or absent, and it carries no more authority
            than the evidence it summarises.
          </p>
          <p>
            The service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without
            warranties of any kind, express or implied, including accuracy, completeness, or
            fitness for a particular purpose.
          </p>
        </Section>

        <Section id="accounts" title="3. Accounts and guest use">
          <p>
            You can use NameVetta without an account. Guest research is tracked well enough to
            enforce a daily limit and to show you your own history, and is never linked to an
            email address or any other personal identifier.
          </p>
          <p>
            Creating an account raises your daily limits and keeps your history across devices.
            You are responsible for the accuracy of the information you provide and for keeping
            your credentials secure. You must be able to form a binding agreement under the law
            that applies to you to create an account.
          </p>
        </Section>

        <Section id="acceptable-use" title="4. Acceptable use">
          <p>You agree not to:</p>
          <ul className="ml-5 list-disc space-y-1.5">
            <li>Automate requests to the service in a way designed to exceed or evade the daily limits, or to scrape it at scale.</li>
            <li>Use the service to build a competing product from its output at scale rather than researching your own names.</li>
            <li>Attempt to access another user&rsquo;s account, private history, or saved names.</li>
            <li>Use the service for any unlawful purpose, or to research names intended to impersonate, defraud, or infringe the rights of others.</li>
            <li>Interfere with the operation of the service, including its rate limits, quotas or underlying infrastructure.</li>
          </ul>
          <p>
            We may suspend or terminate access, with or without notice, for a violation of these
            terms or for abuse of the service.
          </p>
        </Section>

        <Section id="third-party" title="5. Third-party sources">
          <p>
            Results reference public data from GitHub, npm, PyPI, YouTube, the Apple App Store,
            Wikidata, SEC EDGAR, UK Companies House, and general web search, among others.
            NameVetta does not control, endorse, or guarantee the accuracy of any third-party
            source, and a link to one leaves this service and is subject to that site&rsquo;s own
            terms.
          </p>
        </Section>

        <Section id="ip" title="6. Ownership">
          <p>
            NameVetta&rsquo;s own code, design, and branding belong to its operator. The names and
            descriptions you research remain yours; we don&rsquo;t claim any ownership over them,
            and we don&rsquo;t use them for anything beyond producing your report and, where you
            create a share link, showing it to whoever holds that link.
          </p>
        </Section>

        <Section id="liability" title="7. Limitation of liability">
          <p>
            To the fullest extent permitted by law, NameVetta and its operator are not liable for
            any indirect, incidental, or consequential damages arising from your use of the
            service, including a decision made about a name based on a report it produced. Use of
            the service is at your own risk.
          </p>
        </Section>

        <Section id="changes" title="8. Changes">
          <p>
            These terms may change as the service changes. Material changes will update the date
            at the top of this page; continued use after a change means you accept the updated
            terms.
          </p>
        </Section>

        <Section id="contact" title="9. Contact">
          <p>
            Questions about these terms can be sent to the contact address published on the{' '}
            <Link href="/privacy" className="text-accent underline underline-offset-2">
              Privacy Policy
            </Link>{' '}
            page.
          </p>
        </Section>
        </div>
      </div>
    </div>
  )
}
