import { permanentRedirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * The old results URL.
 *
 * Kept as a redirect rather than deleted: `/scan?name=…` was shareable, so
 * links to it exist outside this codebase and breaking them would be a
 * self-inflicted 404. Category and depth carry across where they were set.
 */
export default async function Page({ searchParams }: PageProps<'/scan'>) {
  const params = await searchParams
  const first = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v

  const name = first(params.name)?.trim()
  if (name === undefined || name === '') permanentRedirect('/')

  const query = new URLSearchParams()
  const category = first(params.category)
  if (category !== undefined && category !== '') query.set('as', category)
  if (first(params.type) === 'deep') query.set('deep', '1')

  const suffix = query.size === 0 ? '' : `?${query.toString()}`
  permanentRedirect(`/n/${encodeURIComponent(name)}${suffix}`)
}
