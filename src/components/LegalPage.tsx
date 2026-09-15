/**
 * The shell both legal pages sit in.
 *
 * They used to be laid out like legal documents from somewhere else: a table
 * of contents down the side, nine or eleven numbered sections, a centred
 * narrow column. That is the house style of a law firm's website, not this
 * one, and it made two short honest documents look like something you need a
 * professional to read.
 *
 * Same panel language as everything else, one column, plain headings and no
 * numbering. Nothing was cut to achieve it: every disclosure the old pages
 * made is still here, grouped by the question a reader actually arrives with
 * instead of split into a section each.
 */
import { PageHeader } from '@/components/PageHeader'

export function LegalPage({
  title,
  updated,
  lead,
  children,
}: {
  title: string
  updated: string
  lead: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="page-shell max-w-[840px]">
      {/*
        Centred header, left-aligned body. That split is the alignment rule for
        every page in the app: a heading and its one-line lead are a title
        block and read as one centred object, and everything below is prose,
        which needs a straight left edge to be read at all.
      */}
      <PageHeader title={title}>{lead}<p className="mt-2 text-xs text-faint">Last updated {updated}</p></PageHeader>

      <div className="divide-y divide-line border-t border-line">{children}</div>
    </div>
  )
}

/** One block. A heading a person would actually ask, and the answer. */
export function LegalSection({
  title,
  children,
  collapsible = false,
}: {
  title: string
  children: React.ReactNode
  collapsible?: boolean
}) {
  if (collapsible) {
    return (
      <section className="py-5">
        <details>
          <summary className="flex cursor-pointer list-none items-center gap-2 text-lg font-semibold text-charcoal marker:content-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <span aria-hidden="true" className="text-[11px] text-faint">▸</span>
            {title}
          </summary>
          <div className="mt-4 space-y-3 text-[14.5px] leading-relaxed text-charcoal-2">{children}</div>
        </details>
      </section>
    )
  }

  return (
    <section className="py-7">
      <h2 className="font-display text-lg font-semibold text-charcoal">{title}</h2>
      <div className="mt-3 space-y-3 text-[14.5px] leading-relaxed text-charcoal-2">{children}</div>
    </section>
  )
}
