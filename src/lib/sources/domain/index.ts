/**
 * Domain availability via RDAP (§7).
 *
 * Two rules shape this adapter:
 *
 *  1. We never say "available". RDAP tells us whether a registration record
 *     exists; it says nothing about premium pricing, registry holds, or reserved
 *     names. The phrasing is always "no registration found — confirm with the
 *     registrar".
 *  2. RDAP does not cover every TLD. `.ai` in particular has no RDAP service, so
 *     rather than guessing we fall back to a DNS delegation check and report the
 *     registration status as unverifiable — an honest gap instead of a wrong
 *     answer.
 */
import type { AdapterDeps, SourceAdapter } from '@/lib/core/adapter'
import type { Category, ScanContext } from '@/lib/core/scan'
import type { Evidence, SourceResult } from '@/lib/core/types'
import { request, requestJson, SourceRequestError } from '@/lib/sources/http'
import { buildResult, makeEvidence, unverifiable } from '@/lib/sources/result'
import { normalize } from '@/lib/similarity/normalize'

const IANA_BOOTSTRAP = 'https://data.iana.org/rdap/dns.json'
const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query'

/**
 * Which TLDs to check, by what the user is naming (§7).
 *
 * Deliberately targeted rather than exhaustive: domain runs on both Quick and
 * Deep, so every extra TLD is a real request cost paid on every single scan,
 * not a one-off. A competitor checking 37 TLDs unconditionally is checking
 * plenty a restaurant or a finance product will never register — .lol and
 * .wtf tell a founder nothing useful. Every addition below was checked
 * against the live IANA RDAP bootstrap first, so none of them silently
 * degrade to the lower-confidence DNS fallback the way `.ai` does.
 */
const TLDS_BY_CATEGORY: Partial<Record<Category, string[]>> = {
  saas: ['com', 'io', 'ai', 'app', 'dev', 'co', 'xyz', 'cloud'],
  developer_tool: ['com', 'io', 'dev', 'ai', 'sh', 'app', 'tech'],
  mobile_app: ['com', 'app', 'io', 'co', 'xyz'],
  game: ['com', 'io', 'gg', 'app', 'xyz'],
  creator_brand: ['com', 'co', 'tv', 'me', 'studio', 'live'],
  ecommerce: ['com', 'co', 'shop', 'store', 'online'],
  fashion: ['com', 'co', 'shop', 'style', 'store'],
  restaurant: ['com', 'co', 'menu', 'online'],
  finance: ['com', 'io', 'co', 'finance'],
  education: ['com', 'org', 'io', 'academy'],
  business: ['com', 'co', 'io', 'org', 'agency', 'digital'],
  other: ['com', 'io', 'co', 'app', 'xyz', 'site'],
}

/**
 * Every TLD checked on a scan.
 *
 * The category tables above no longer decide *whether* a TLD is checked, only
 * which ones lead: a founder who picks "SaaS" still wants to know their .co is
 * gone. So the category list is checked first and the rest follow, and the
 * report shows them all.
 *
 * Thirty-seven lookups is a lot more than the four to eight this used to do.
 * They run in bounded batches rather than all at once, because thirty-seven
 * simultaneous RDAP requests from one address is exactly the burst the
 * per-source rate limiter exists to prevent.
 */
const ALL_TLDS = [
  'com', 'net', 'org', 'io', 'ai', 'co', 'dev',
  'app', 'xyz', 'tech', 'me', 'info', 'pro', 'page',
  'run', 'cloud', 'site', 'online', 'live', 'space',
  'one', 'name', 'design', 'studio', 'store', 'blog',
  'agency', 'digital', 'world', 'wtf', 'lol', 'tv', 'cc',
  'ly', 'to', 'fm', 'in',
]

/** How many RDAP lookups are in flight at once. */
const TLD_BATCH = 6

const DEFAULT_TLDS = ['com', 'io', 'co', 'app']

interface BootstrapFile {
  services: [string[], string[]][]
}

/**
 * IANA's bootstrap registry maps TLDs to RDAP base URLs. It changes rarely, so
 * it is cached for the process lifetime; a cold start re-fetches it.
 */
let bootstrapCache: Map<string, string> | undefined

async function loadBootstrap(signal: AbortSignal): Promise<Map<string, string>> {
  if (bootstrapCache !== undefined) return bootstrapCache

  const { data } = await requestJson<BootstrapFile>(IANA_BOOTSTRAP, {
    signal,
    expectedStatuses: [],
  })
  const map = new Map<string, string>()
  for (const [tlds, urls] of data?.services ?? []) {
    const base = urls[0]
    if (base === undefined) continue
    for (const tld of tlds) map.set(tld.toLowerCase(), base.replace(/\/$/, ''))
  }
  bootstrapCache = map
  return map
}

/** Test seam: clear the memoised bootstrap between cases. */
export function resetBootstrapCache(): void {
  bootstrapCache = undefined
}

type DomainState = 'registered' | 'no_registration' | 'unknown'

interface DomainCheck {
  domain: string
  state: DomainState
  note: string
  url?: string
}

/** A cheap, fail-closed knockout check before a generated name gets a full scan. */
export async function checkCandidateDomain(name: string, signal: AbortSignal): Promise<DomainCheck> {
  const domain = `${normalize(name)}.com`
  try {
    signal.throwIfAborted()
    const bootstrap = await loadBootstrap(signal)
    const base = bootstrap.get('com')
    if (base !== undefined) return await checkViaRdap(domain, base, signal)
  } catch { /* An outage cannot establish availability. */ }
  return { domain, state: 'unknown', note: `${domain}: registration could not be checked.` }
}

async function checkViaRdap(
  domain: string,
  base: string,
  signal: AbortSignal,
): Promise<DomainCheck> {
  const response = await request(`${base}/domain/${domain}`, {
    signal,
    expectedStatuses: [404, 422],
    retries: 1,
  })

  if (response.status === 404) {
    return {
      domain,
      state: 'no_registration',
      note: `${domain}: no registration found. Confirm with a registrar before purchase.`,
    }
  }
  if (response.ok) {
    return {
      domain,
      state: 'registered',
      note: `${domain}: a registration record exists.`,
      url: `https://${domain}`,
    }
  }
  return { domain, state: 'unknown', note: `${domain}: RDAP returned ${response.status}.` }
}

/**
 * DNS-over-HTTPS fallback for TLDs with no RDAP service.
 *
 * A delegated name (NS records present) is definitely taken. The absence of NS
 * records is *not* proof the name is free — a registered domain need not be
 * delegated — so that case stays `unknown` rather than being upgraded.
 */
async function checkViaDns(domain: string, signal: AbortSignal): Promise<DomainCheck> {
  const { data } = await requestJson<{ Status: number; Answer?: unknown[] }>(
    `${DOH_ENDPOINT}?name=${encodeURIComponent(domain)}&type=NS`,
    { signal, headers: { accept: 'application/dns-json' }, expectedStatuses: [], retries: 1 },
  )

  const delegated = Array.isArray(data?.Answer) && data.Answer.length > 0
  if (delegated) {
    return {
      domain,
      state: 'registered',
      note: `${domain}: no RDAP for this TLD, but DNS shows the name is delegated, so it is registered.`,
      url: `https://${domain}`,
    }
  }
  return {
    domain,
    state: 'unknown',
    note: `${domain}: no RDAP service for this TLD and DNS shows no delegation. Registration status could not be verified.`,
  }
}

/**
 * Single-substitution lookalike labels for the `.com` squatting check.
 *
 * Deliberately narrow: ASCII character swaps only, not a full Unicode
 * homoglyph/IDN sweep — that needs punycode-encoded lookups and a much larger
 * surface. This catches the common, cheap version of the same attack: `rn`
 * for `m`, `0` for `o`, `1`/`l`/`i` for each other. At most three variants,
 * generated deterministically so the same name always checks the same
 * candidates.
 */
function squatVariants(label: string): string[] {
  const swaps: [RegExp, string][] = [
    [/m/g, 'rn'],
    [/o/g, '0'],
    [/l/g, '1'],
  ]
  const variants = new Set<string>()
  for (const [pattern, replacement] of swaps) {
    const variant = label.replace(pattern, replacement)
    if (variant !== label) variants.add(variant)
  }
  return [...variants].slice(0, 3)
}

/**
 * Whether a registered domain shows any sign of actually being used.
 *
 * A registration record only says a name was claimed, not that anyone is
 * doing anything with it — a parked domain is a much weaker obstacle than a
 * live site or mailbox. Checked only for domains that came back registered,
 * over the same DoH endpoint the RDAP fallback already uses, so this adds no
 * new dependency. Best-effort and additive only: a failure or an inconclusive
 * answer here never changes the registration status itself, only whether a
 * note about liveness gets added to the evidence.
 */
async function parkedNote(domain: string, signal: AbortSignal): Promise<string | undefined> {
  try {
    const [a, mx] = await Promise.all([
      requestJson<{ Answer?: unknown[] }>(
        `${DOH_ENDPOINT}?name=${encodeURIComponent(domain)}&type=A`,
        { signal, headers: { accept: 'application/dns-json' }, expectedStatuses: [], retries: 0 },
      ),
      requestJson<{ Answer?: unknown[] }>(
        `${DOH_ENDPOINT}?name=${encodeURIComponent(domain)}&type=MX`,
        { signal, headers: { accept: 'application/dns-json' }, expectedStatuses: [], retries: 0 },
      ),
    ])
    const live =
      (Array.isArray(a.data?.Answer) && a.data.Answer.length > 0) ||
      (Array.isArray(mx.data?.Answer) && mx.data.Answer.length > 0)
    if (live) return undefined
    return `${domain}: no A record and no mail server found. Likely parked or unused — a weaker obstacle than an active site.`
  } catch {
    return undefined
  }
}

export const domainAdapter: SourceAdapter = {
  id: 'domain',

  async run(ctx: ScanContext, deps: AdapterDeps): Promise<SourceResult> {
    const label = normalize(ctx.name)
    if (label.length === 0) {
      return unverifiable('domain', 'INVALID_NAME', 'Name contains no usable characters', false)
    }

    let bootstrap: Map<string, string>
    try {
      bootstrap = await loadBootstrap(deps.signal)
    } catch (cause) {
      const err = cause instanceof SourceRequestError ? cause : undefined
      return unverifiable(
        'domain',
        err?.code ?? 'BOOTSTRAP_FAILED',
        'Could not load the IANA RDAP registry, so domains were not checked.',
        true,
      )
    }

    // Category first, then everything else, so the most relevant answers land
    // first and a timeout costs the least useful ones.
    const preferred = TLDS_BY_CATEGORY[ctx.category] ?? DEFAULT_TLDS
    const tlds = [...preferred, ...ALL_TLDS.filter((t) => !preferred.includes(t))]

    const checkOne = async (tld: string): Promise<DomainCheck> => {
      const domain = `${label}.${tld}`
      const base = bootstrap.get(tld)
      try {
        return base === undefined
          ? await checkViaDns(domain, deps.signal)
          : await checkViaRdap(domain, base, deps.signal)
      } catch {
        // One TLD failing must not lose the answers for the others.
        return { domain, state: 'unknown', note: `${domain}: lookup failed.` }
      }
    }

    const checks: DomainCheck[] = []
    for (let i = 0; i < tlds.length; i += TLD_BATCH) {
      checks.push(...(await Promise.all(tlds.slice(i, i + TLD_BATCH).map(checkOne))))
    }

    deps.log('domain.checked', { tlds: tlds.length })

    const evidence: Evidence[] = checks.map((c) =>
      makeEvidence('domain', c.note, c.url),
    )

    const registered = checks.filter((c) => c.state === 'registered')
    const unknown = checks.filter((c) => c.state === 'unknown')

    // Only worth asking for domains that are actually registered, and capped
    // to the handful that ever apply — most scans have zero or one.
    const parkedNotes = (
      await Promise.all(registered.map((c) => parkedNote(c.domain, deps.signal)))
    ).filter((n): n is string => n !== undefined)
    for (const note of parkedNotes) evidence.push(makeEvidence('domain', note))

    // Lookalike `.com` squatting check — Deep Check only, since it multiplies
    // request count for a signal that is secondary to the main registration
    // answer. A registered lookalike is worth flagging regardless of whether
    // the candidate's own `.com` is taken.
    if (ctx.scanType === 'deep') {
      const comBase = bootstrap.get('com')
      const variants = squatVariants(label).map((v) => `${v}.com`)
      const squatChecks = await Promise.all(
        variants.map(async (domain): Promise<DomainCheck | undefined> => {
          try {
            return comBase === undefined
              ? await checkViaDns(domain, deps.signal)
              : await checkViaRdap(domain, comBase, deps.signal)
          } catch {
            return undefined
          }
        }),
      )
      for (const check of squatChecks) {
        if (check?.state !== 'registered') continue
        evidence.push(
          makeEvidence(
            'domain',
            `${check.domain} is registered — a lookalike of this name using a common character swap (rn/m, 0/o, 1/l). Worth checking who holds it.`,
            check.url,
          ),
        )
      }
    }

    // Every single TLD failing means we learned nothing at all.
    if (unknown.length === checks.length) {
      return buildResult({
        source: 'domain',
        status: 'unable_to_verify',
        evidence,
        error: {
          code: 'ALL_LOOKUPS_FAILED',
          message: 'No domain lookup succeeded.',
          retryable: true,
        },
      })
    }

    // Domains are reported as evidence rather than as `Match` objects: a taken
    // .com is a fact about availability, not a confusable brand, and modelling
    // it as a match would let it leak into similarity and cap logic.
    const status =
      registered.length === checks.length
        ? 'confirmed_conflict'
        : registered.length > 0
          ? 'similar_found'
          : 'no_conflict'

    return buildResult({
      source: 'domain',
      status,
      evidence,
      meta: {
        canonicalComState: checks.find((check) => check.domain === `${label}.com`)?.state ?? 'unknown',
        checked: checks.length,
        registered: registered.length,
        unverified: unknown.length,
      },
    })
  },
}
