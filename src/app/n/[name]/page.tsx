import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { ScanRunner } from '@/components/ScanRunner'
import { StoredReport } from '@/components/StoredReport'
import { CategoryPicker } from '@/components/CategoryPicker'
import { CategorySchema, MAX_NAME_LENGTH, type Category } from '@/lib/core/scan'
import { currentUser } from '@/lib/db/auth'
import { isDatabaseConfigured } from '@/lib/db/client'
import { storedScan } from '@/lib/db/history'
import { identifySubject } from '@/lib/db/identity'

export const dynamic = 'force-dynamic'

// A result for one name. Nothing here is a page a search engine should keep,
// and the name being researched is the user's, not ours to publish.
export const metadata = {
  title: 'Results | NameVetta',
  robots: { index: false, follow: false },
}

/**
 * The result, at a URL a person can read.
 *
 * Replaces `/scan?name=…&category=…&type=…`. Category is a *query* rather than
 * part of the path because it is a refinement, not an identity: `/n/northbeam`
 * is the same name whether you check it as a SaaS or a restaurant.
 */
export default async function Page({ params, searchParams }: PageProps<'/n/[name]'>) {
  const { name: raw } = await params
  const query = await searchParams

  const name = decodeURIComponent(raw).trim()
  if (name === '' || name.length > MAX_NAME_LENGTH) notFound()

  const first = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v

  // `other` is the honest default: the homepage asks nothing, so we have not
  // been told what this is. Its weight table is the most evenly spread one,
  // which is the right behaviour when we genuinely do not know.
  const parsed = CategorySchema.safeParse(first(query.as))
  const category: Category = parsed.success ? parsed.data : 'other'

  const scanType = first(query.deep) === '1' ? 'deep' : 'quick'
  const includeSpecialized = first(query.broad) === '1'

  // `?pick=1` comes from the "change" link on the result.
  if (first(query.pick) === '1') {
    return <CategoryPicker name={name} current={category} scanType={scanType} includeSpecialized={includeSpecialized} />
  }

  /*
    `?scan=<id>` reopens a report instead of researching one.

    History links here. Without it every row in the list started a fresh check
    the moment it was clicked, which spent an allowance unit to show somebody
    what they had already looked at and wrote a duplicate row while doing it.
    An id that is missing, unfinished, or somebody else's falls through to a
    live scan rather than erroring — the visitor asked to see this name, and
    that is still the honest answer to give them.
  */
  const scanId = first(query.scan)
  if (scanId !== undefined && scanId !== '') {
    if (!isDatabaseConfigured()) notFound()
    const user = await currentUser()
    const subject = identifySubject(await headers(), user?.id)
    const stored = subject === undefined ? undefined : await storedScan(subject, scanId)
    if (stored === undefined) notFound()
    return <StoredReport scan={stored} />
  }

  return (
    <ScanRunner
      context={{
        name,
        category,
        scanType,
        ...(includeSpecialized ? { includeSpecialized: true } : {}),
      }}
    />
  )
}
