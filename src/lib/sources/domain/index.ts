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
      note: `${domain} — no registration found. Confirm with a registrar before purchase.`,
    }
  }
  if (response.ok) {
    return {
      domain,
      state: 'registered',
      note: `${domain} — a registration record exists.`,
      url: `https://${domain}`,
    }
  }
  return { domain, state: 'unknown', note: `${domain} — RDAP returned ${response.status}.` }
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
      note: `${domain} — no RDAP for this TLD, but DNS shows the name is delegated, so it is registered.`,
      url: `https://${domain}`,
    }
  }
  return {
    domain,
    state: 'unknown',
    note: `${domain} — no RDAP service for this TLD and DNS shows no delegation. Registration status could not be verified.`,
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

    const tlds = TLDS_BY_CATEGORY[ctx.category] ?? DEFAULT_TLDS

    const checks = await Promise.all(
      tlds.map(async (tld): Promise<DomainCheck> => {
        const domain = `${label}.${tld}`
        const base = bootstrap.get(tld)
        try {
          return base === undefined
            ? await checkViaDns(domain, deps.signal)
            : await checkViaRdap(domain, base, deps.signal)
        } catch {
          // One TLD failing must not lose the answers for the others.
          return { domain, state: 'unknown', note: `${domain} — lookup failed.` }
        }
      }),
    )

    deps.log('domain.checked', { tlds: tlds.length })

    const evidence: Evidence[] = checks.map((c) =>
      makeEvidence('domain', c.note, c.url),
    )

    const registered = checks.filter((c) => c.state === 'registered')
    const unknown = checks.filter((c) => c.state === 'unknown')

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
        checked: checks.length,
        registered: registered.length,
        unverified: unknown.length,
      },
    })
  },
}
