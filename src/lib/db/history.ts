import 'server-only'

/**
 * Scan history, saved names and share links.
 *
 * Reads for a signed-in user go through the **RLS client**, so the database
 * decides what they can see rather than this file remembering to filter. Guest
 * reads go through the service client because a guest has no identity RLS can
 * check — the hash is verified here instead, and it is never accepted from the
 * client.
 */
import { randomBytes } from 'node:crypto'
import type { Category } from '@/lib/core/scan'
import { sessionClient } from './auth'
import { isDatabaseConfigured, serviceClient } from './client'
import type { Subject } from './identity'

export interface HistoryEntry {
  id: string
  name: string
  category: string
  scanType: 'quick' | 'deep'
  status: string
  createdAt: string
  score: number | undefined
  coverage: number | undefined
  verdict: string | undefined
}

interface ReportRow {
  digital_score: number
  coverage: number
  verdict: string
}

interface ScanRow {
  id: string
  name: string
  category: string
  scan_type: 'quick' | 'deep'
  status: string
  created_at: string
  /**
   * PostgREST returns an **object** here, not an array, because
   * `reports.scan_id` carries a UNIQUE constraint and it therefore detects a
   * one-to-one relationship. Both shapes are handled: relying on the embed
   * shape is exactly the kind of thing that changes when a constraint moves.
   */
  reports: ReportRow | ReportRow[] | null
}

function toEntry(row: ScanRow): HistoryEntry {
  const report = Array.isArray(row.reports) ? row.reports[0] : (row.reports ?? undefined)
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    scanType: row.scan_type,
    status: row.status,
    createdAt: row.created_at,
    score: report?.digital_score,
    coverage: report?.coverage,
    verdict: report?.verdict,
  }
}

const SELECT = 'id, name, category, scan_type, status, created_at, reports(digital_score, coverage, verdict)'

/** Recent scans for a subject. Empty when persistence is unavailable. */
export async function recentScans(subject: Subject, limit = 50): Promise<HistoryEntry[]> {
  if (!isDatabaseConfigured()) return []

  if (subject.type === 'user') {
    // RLS scopes this to the signed-in user; no explicit filter is needed, and
    // relying on the database rather than a where-clause is the point.
    const supabase = await sessionClient()
    const { data, error } = await supabase
      .from('scans')
      .select(SELECT)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error !== null || data === null) return []
    return (data as unknown as ScanRow[]).map(toEntry)
  }

  // Guests have no identity RLS can verify, so the hash is matched server-side
  // using the service client. The hash itself is derived from the request, never
  // supplied by the caller.
  const { data, error } = await serviceClient()
    .from('scans')
    .select(SELECT)
    .eq('guest_hash', subject.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error !== null || data === null) return []
  return (data as unknown as ScanRow[]).map(toEntry)
}

/** Delete one scan, cascading to its results, evidence and report. */
export async function deleteScan(subject: Subject, scanId: string): Promise<boolean> {
  if (!isDatabaseConfigured()) return false

  if (subject.type === 'user') {
    const supabase = await sessionClient()
    const { error } = await supabase.from('scans').delete().eq('id', scanId)
    return error === null
  }

  // Ownership is checked explicitly for guests, since RLS cannot do it.
  const { error } = await serviceClient()
    .from('scans')
    .delete()
    .eq('id', scanId)
    .eq('guest_hash', subject.id)
  return error === null
}

/* -------------------------------------------------------------------------- */
/* Saved names                                                                */
/* -------------------------------------------------------------------------- */

export interface SavedName {
  id: string
  name: string
  category: string
  note: string | undefined
  createdAt: string
}

/** Saved names require an account: there is nowhere safe to hang them otherwise. */
export async function savedNames(userId: string): Promise<SavedName[]> {
  if (!isDatabaseConfigured() || userId === '') return []

  const supabase = await sessionClient()
  const { data, error } = await supabase
    .from('saved_names')
    .select('id, name, category, note, created_at')
    .order('created_at', { ascending: false })

  if (error !== null || data === null) return []
  return (data as { id: string; name: string; category: string; note: string | null; created_at: string }[]).map(
    (r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      note: r.note ?? undefined,
      createdAt: r.created_at,
    }),
  )
}

export async function saveName(
  userId: string,
  name: string,
  category: Category,
  note?: string,
): Promise<boolean> {
  if (!isDatabaseConfigured()) return false
  const supabase = await sessionClient()
  const { error } = await supabase
    .from('saved_names')
    .upsert(
      { user_id: userId, name, category, note: note ?? null },
      { onConflict: 'user_id,name,category' },
    )
  return error === null
}

export async function unsaveName(id: string): Promise<boolean> {
  if (!isDatabaseConfigured()) return false
  const supabase = await sessionClient()
  const { error } = await supabase.from('saved_names').delete().eq('id', id)
  return error === null
}

/* -------------------------------------------------------------------------- */
/* Share links                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Generate an opaque share token.
 *
 * 24 bytes of CSPRNG output, base64url. The token *is* the capability — anyone
 * holding it can read the report — so it must be long enough that guessing is
 * hopeless and must never be derived from the report id.
 */
function newToken(): string {
  return randomBytes(24).toString('base64url')
}

export interface ShareResult {
  token: string
  url: string
}

/** Create a share link for a report the caller owns. */
export async function createShareLink(
  subject: Subject,
  scanId: string,
  origin: string,
): Promise<ShareResult | undefined> {
  if (!isDatabaseConfigured()) return undefined

  const db = serviceClient()

  // Verify ownership before minting a capability. Without this check any scan id
  // could be turned into a public link by anybody who guessed it.
  const { data: scan, error: scanError } = await db
    .from('scans')
    .select('id, user_id, guest_hash')
    .eq('id', scanId)
    .single()

  if (scanError !== null || scan === null) return undefined
  const row = scan as { id: string; user_id: string | null; guest_hash: string | null }
  const owns =
    subject.type === 'user' ? row.user_id === subject.id : row.guest_hash === subject.id
  if (!owns) return undefined

  const { data: report } = await db
    .from('reports')
    .select('id')
    .eq('scan_id', scanId)
    .single()
  if (report === null) return undefined

  const token = newToken()
  const { error } = await db.from('share_links').insert({
    token,
    report_id: (report as { id: string }).id,
    created_by: subject.type === 'user' ? subject.id : null,
  })
  if (error !== null) return undefined

  return { token, url: `${origin}/r/${token}` }
}

export interface SharedReport {
  name: string
  category: string
  description: string | undefined
  scanType: string
  score: number
  coverage: number
  verdict: string
  scoringVersion: number
  createdAt: string
}

/**
 * Read a shared report by token.
 *
 * Goes through the `get_shared_report` SQL function, which is the only path that
 * bypasses RLS and does so only for a live, unrevoked token.
 */
export async function sharedReport(token: string): Promise<SharedReport | undefined> {
  if (!isDatabaseConfigured()) return undefined

  const { data, error } = await serviceClient().rpc('get_shared_report', { p_token: token })
  if (error !== null || !Array.isArray(data) || data.length === 0) return undefined

  const row = data[0] as Record<string, unknown>
  return {
    name: String(row.scan_name),
    category: String(row.scan_category),
    description: row.scan_description === null ? undefined : String(row.scan_description),
    scanType: String(row.scan_type),
    score: Number(row.digital_score),
    coverage: Number(row.coverage),
    verdict: String(row.verdict),
    scoringVersion: Number(row.scoring_version),
    createdAt: String(row.created_at),
  }
}

/** Revoke a share link. The report becomes unreachable immediately. */
export async function revokeShareLink(subject: Subject, token: string): Promise<boolean> {
  if (!isDatabaseConfigured()) return false
  if (subject.type !== 'user') return false

  const supabase = await sessionClient()
  const { error } = await supabase
    .from('share_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token', token)
  return error === null
}

/* -------------------------------------------------------------------------- */
/* Reopening a stored scan                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A finished scan, rebuilt from what was written down.
 *
 * History used to link every row at `/n/{name}`, which starts a fresh scan —
 * so looking at what you already researched spent another Quick Check and
 * wrote another history row, and the list filled with copies of the same name
 * minutes apart. Everything needed to render the report was already in the
 * database; nothing was reading it back.
 *
 * The score is recomputed from the stored results rather than read from
 * `reports`. Both are honest, and recomputing is the one that cannot go stale:
 * a report recorded under an older scoring version would otherwise render
 * today's evidence beside a number today's rules would not produce. The stored
 * figure comes back too, so the page can say when they differ.
 */
export interface StoredScan {
  scanId: string
  name: string
  category: string
  description: string | undefined
  scanType: 'quick' | 'deep'
  includeSpecialized: boolean
  createdAt: string
  results: unknown[]
  /** What was recorded at the time, for comparison against a recompute. */
  recorded: { score: number; coverage: number; scoringVersion: number } | undefined
}

const STORED_SELECT = `
  id, name, category, description, scan_type, include_specialized, status, created_at,
  reports(digital_score, coverage, scoring_version),
  source_results(
    source, status, confidence, error_code, error_message, error_retryable,
    from_cache, meta, checked_at, expires_at,
    source_evidence(label, url, snippet, observed_at),
    similar_matches(
      external_id, name, owner, description, categories, active, url, is_exact,
      sim_text, sim_phonetic, sim_visual, sim_industry, sim_overall, severity
    )
  )
`

interface StoredMatchRow {
  external_id: string
  name: string
  owner: string | null
  description: string | null
  categories: string[] | null
  active: boolean | null
  url: string | null
  is_exact: boolean
  sim_text: number
  sim_phonetic: number
  sim_visual: number
  sim_industry: number | null
  sim_overall: number
  severity: string
}

interface StoredResultRow {
  source: string
  status: string
  confidence: number
  error_code: string | null
  error_message: string | null
  error_retryable: boolean | null
  from_cache: boolean
  meta: Record<string, unknown> | null
  checked_at: string
  expires_at: string
  source_evidence: { label: string; url: string | null; snippet: string | null; observed_at: string }[] | null
  similar_matches: StoredMatchRow[] | null
}

function toMatch(row: StoredMatchRow, source: string): Record<string, unknown> {
  return {
    externalId: row.external_id,
    name: row.name,
    categories: row.categories ?? [],
    similarity: {
      text: row.sim_text,
      phonetic: row.sim_phonetic,
      visual: row.sim_visual,
      overall: row.sim_overall,
      // Absent stays absent: an unknown industry must not become a zero.
      ...(row.sim_industry === null ? {} : { industry: row.sim_industry }),
    },
    severity: row.severity,
    evidence: [],
    ...(row.owner === null ? {} : { owner: row.owner }),
    ...(row.description === null ? {} : { description: row.description }),
    ...(row.active === null ? {} : { active: row.active }),
    ...(row.url === null ? {} : { url: row.url }),
    _source: source,
  }
}

function toResult(row: StoredResultRow): Record<string, unknown> {
  const matches = row.similar_matches ?? []
  return {
    source: row.source,
    status: row.status,
    confidence: row.confidence,
    exactMatches: matches.filter((m) => m.is_exact).map((m) => toMatch(m, row.source)),
    similarMatches: matches.filter((m) => !m.is_exact).map((m) => toMatch(m, row.source)),
    evidence: (row.source_evidence ?? []).map((e) => ({
      label: e.label,
      source: row.source,
      observedAt: e.observed_at,
      ...(e.url === null ? {} : { url: e.url }),
      ...(e.snippet === null ? {} : { snippet: e.snippet }),
    })),
    checkedAt: row.checked_at,
    expiresAt: row.expires_at,
    fromCache: row.from_cache,
    ...(row.error_code === null
      ? {}
      : {
          error: {
            code: row.error_code,
            message: row.error_message ?? 'This source could not be checked.',
            retryable: row.error_retryable ?? false,
          },
        }),
    ...(row.meta === null ? {} : { meta: row.meta }),
  }
}

/**
 * Load one stored scan, scoped to whoever is asking.
 *
 * A signed-in reader goes through RLS; a guest's ownership is checked here,
 * because a guest hash is not an identity the database can reason about. Both
 * paths return `undefined` rather than throwing on a scan that is missing or
 * someone else's — the caller falls back to offering a fresh check.
 */
export async function storedScan(
  subject: Subject,
  scanId: string,
): Promise<StoredScan | undefined> {
  if (!isDatabaseConfigured()) return undefined

  const query =
    subject.type === 'user'
      ? (await sessionClient()).from('scans').select(STORED_SELECT).eq('id', scanId)
      : serviceClient()
          .from('scans')
          .select(STORED_SELECT)
          .eq('id', scanId)
          .eq('guest_hash', subject.id)

  const { data, error } = await query.maybeSingle()
  if (error !== null || data === null) return undefined

  const row = data as unknown as {
    id: string
    name: string
    category: string
    description: string | null
    scan_type: 'quick' | 'deep'
    include_specialized: boolean
    status: string
    created_at: string
    reports: { digital_score: number; coverage: number; scoring_version: number }[] | { digital_score: number; coverage: number; scoring_version: number } | null
    source_results: StoredResultRow[] | null
  }

  // A scan that never finished has nothing to reopen.
  if (row.status !== 'complete') return undefined

  const report = Array.isArray(row.reports) ? row.reports[0] : (row.reports ?? undefined)

  return {
    scanId: row.id,
    name: row.name,
    category: row.category,
    description: row.description ?? undefined,
    scanType: row.scan_type,
    includeSpecialized: row.include_specialized,
    createdAt: row.created_at,
    results: (row.source_results ?? []).map(toResult),
    recorded:
      report === undefined
        ? undefined
        : {
            score: report.digital_score,
            coverage: report.coverage,
            scoringVersion: report.scoring_version,
          },
  }
}
