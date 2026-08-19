import { notFound } from 'next/navigation'
import { ScanRunner } from '@/components/ScanRunner'
import { CategoryPicker } from '@/components/CategoryPicker'
import { CategorySchema, MAX_NAME_LENGTH, type Category } from '@/lib/core/scan'

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

  // `?pick=1` comes from the "change" link on the result.
  if (first(query.pick) === '1') {
    return <CategoryPicker name={name} current={category} />
  }

  return (
    <ScanRunner
      context={{
        name,
        category,
        scanType: first(query.deep) === '1' ? 'deep' : 'quick',
      }}
    />
  )
}
