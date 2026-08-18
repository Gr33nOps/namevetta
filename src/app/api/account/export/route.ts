/**
 * Data export (§14, Privacy Policy §7).
 *
 * Everything a signed-in user owns, as one JSON file. Queried through the
 * RLS-respecting client rather than the service client — the database scopes
 * every row to the caller by construction, so there is no risk of an export
 * handler bug leaking another user's data the way a hand-written filter could.
 */
import { currentUser } from '@/lib/db/auth'
import { isDatabaseConfigured } from '@/lib/db/client'
import { sessionClient } from '@/lib/db/auth'

export const dynamic = 'force-dynamic'

const SCAN_SELECT = `
  *,
  source_results(*, source_evidence(*), similar_matches(*)),
  reports(*, report_group_scores(*), report_caps(*), ai_summaries(*))
`

export async function GET(): Promise<Response> {
  if (!isDatabaseConfigured()) {
    return Response.json({ error: 'Accounts are not available in this environment.' }, { status: 400 })
  }

  const user = await currentUser()
  if (user === undefined) {
    return Response.json({ error: 'Sign in to export your data.' }, { status: 401 })
  }

  const supabase = await sessionClient()

  // Every query below goes through RLS, so each is already scoped to this
  // user by the database — nothing here does its own filtering.
  const [scans, savedNames, shareLinks] = await Promise.all([
    supabase.from('scans').select(SCAN_SELECT).order('created_at', { ascending: false }),
    supabase.from('saved_names').select('*').order('created_at', { ascending: false }),
    supabase.from('share_links').select('*').order('created_at', { ascending: false }),
  ])

  const body = {
    exportedAt: new Date().toISOString(),
    account: { id: user.id, email: user.email },
    scans: scans.data ?? [],
    savedNames: savedNames.data ?? [],
    shareLinks: shareLinks.data ?? [],
  }

  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="namevetta-export-${user.id}.json"`,
      'cache-control': 'no-store',
    },
  })
}
