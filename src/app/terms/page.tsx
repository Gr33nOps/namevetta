import Link from 'next/link'
import { LegalPage, LegalSection } from '@/components/LegalPage'
import { SCOPE_NOTICE, TRADEMARK_DISCLAIMER } from '@/lib/presentation'

export const metadata = {
  title: 'Terms of Service | NameVetta',
  description: 'The terms for using NameVetta.',
  alternates: { canonical: '/terms' },
  openGraph: {
    title: 'Terms of Service | NameVetta',
    description:
      'What this service is, what its results are worth, and what you agree to by using it.',
    url: '/terms',
  },
}

const UPDATED = '2026-08-18'

export default function Page() {
  return (
    <LegalPage
      title="Terms"
      updated={UPDATED}
      lead="Terms for using NameVetta."
    >
      <LegalSection title="What this is">
        <p>
          This service researches whether a name is already in use across domains, code registries,
          app stores, company registers and general web presence, and reports what it found with
          evidence you can check yourself.
        </p>
        <p className="rounded-xl border border-accent-border bg-accent-soft px-3.5 py-2.5 text-accent-ink">
          {SCOPE_NOTICE} {TRADEMARK_DISCLAIMER}
        </p>
        <p>
          Nothing here is legal, trademark, business or professional advice of any kind. A clean
          report is not permission to use a name, and a conflict is not a legal determination that
          you cannot. Decisions about registering, launching or defending a name are yours, and you
          should get advice from a qualified professional, a trademark attorney in most cases,
          before making them.
        </p>
      </LegalSection>

      <LegalSection title="No warranty on results">
        <p>
          Every result comes from a specific named source and is shown with the evidence behind it.
          Those sources can be rate-limited, temporarily unavailable, incomplete, or simply wrong,
          and this service reports that honestly rather than guessing. A source marked
          &ldquo;unverifiable&rdquo; or &ldquo;manual check&rdquo; means exactly that: we
          don&rsquo;t know, not that the name is free.
        </p>
        <p>
          Where an explanation is written by an AI model, it is generated only from the findings
          already on the same report and checked against them before being shown. It can still be
          unavailable, wrong, or absent, and it carries no more authority than the evidence it
          summarises.
        </p>
        <p>
          The service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without
          warranties of any kind, express or implied, including accuracy, completeness, or fitness
          for a particular purpose.
        </p>
      </LegalSection>

      <LegalSection title="Accounts and fair use">
        <p>
          You can use the service without an account. Guest research is tracked well enough to
          enforce a daily limit and show you your own history, and is never linked to an email or
          any other personal identifier. An account raises your daily limits and keeps your history
          across devices. You are responsible for the accuracy of what you provide and for keeping
          your credentials secure, and you must be able to form a binding agreement under the law
          that applies to you.
        </p>
        <p>You agree not to:</p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            Automate requests to exceed or evade the daily limits, or to scrape the service at
            scale.
          </li>
          <li>
            Use its output to build a competing product at scale, rather than researching your own
            names.
          </li>
          <li>Attempt to access another user&rsquo;s account, history, or saved names.</li>
          <li>
            Use it for any unlawful purpose, or to research names intended to impersonate, defraud,
            or infringe the rights of others.
          </li>
          <li>
            Interfere with the operation of the service, including its rate limits, quotas or
            underlying infrastructure.
          </li>
        </ul>
        <p>
          Access may be suspended or terminated, with or without notice, for a violation of these
          terms or for abuse of the service.
        </p>
      </LegalSection>

      <LegalSection title="Third-party sources, and who owns what">
        <p>
          Results reference public data from GitHub, npm, PyPI, YouTube, the Apple App Store,
          Wikidata, SEC EDGAR, UK Companies House and general web search, among others. This
          service does not control, endorse, or guarantee the accuracy of any third-party source,
          and a link to one leaves this service and is subject to that site&rsquo;s own terms.
        </p>
        <p>
          The code, design and branding here belong to the operator. The names and descriptions you
          research remain yours: no ownership is claimed over them, and they are not used for
          anything beyond producing your report and, where you create a share link, showing it to
          whoever holds that link.
        </p>
      </LegalSection>

      <LegalSection title="Limitation of liability">
        <p>
          To the fullest extent permitted by law, this service and its operator are not liable for
          any indirect, incidental, or consequential damages arising from your use of it, including
          a decision made about a name based on a report it produced. Use of the service is at your
          own risk.
        </p>
      </LegalSection>

      <LegalSection title="Changes and contact">
        <p>
          These terms may change as the service changes. Material changes update the date above,
          and continued use after a change means you accept the updated terms. Questions can go to
          the contact address published on the{' '}
          <Link href="/privacy" className="text-accent-ink underline underline-offset-2">
            privacy page
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  )
}
