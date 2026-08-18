import Link from 'next/link'
import { ScanRunner } from '@/components/ScanRunner'
import { ScanContextSchema } from '@/lib/core/scan'

/**
 * The scan route.
 *
 * Phase 1 carries the request in the query string because there is no database
 * yet. Phase 4 moves this to `/scan/[id]` backed by a `scans` row, at which
 * point this page reads the row instead of the params — `ScanRunner` and the
 * report do not change.
 */
export default async function Page({ searchParams }: PageProps<'/scan'>) {
  const params = await searchParams

  const first = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value

  const description = first(params.description)
  const parsed = ScanContextSchema.safeParse({
    name: first(params.name),
    category: first(params.category),
    scanType: first(params.type),
    ...(description === undefined || description.trim() === '' ? {} : { description }),
  })

  if (!parsed.success) {
    return (
      <div className="mx-auto mt-14 w-full max-w-[520px] rounded-xl border border-line bg-surface p-6 text-center">
        <h1 className="font-display text-xl font-semibold">That search request was not valid</h1>
        <p className="mt-2 text-sm text-charcoal-2">
          {parsed.error.issues[0]?.message ?? 'Please try again from the homepage.'}
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Start a new search
        </Link>
      </div>
    )
  }

  return <ScanRunner context={parsed.data} />
}
