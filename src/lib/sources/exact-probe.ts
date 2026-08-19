/**
 * Adapters for registries that answer one question: is this exact name taken?
 *
 * Several registries hand a server a clean yes or no on a single URL — a 200
 * for a claimed name, a 404 for a free one, and nothing in between. Written out
 * longhand each one is the same forty lines with a different hostname, so this
 * builds them from a description instead.
 *
 * Deliberately **not** used for anything with a search endpoint. A registry that
 * can tell you about near misses deserves an adapter that asks about near
 * misses; flattening it to an exact probe would quietly throw that away.
 *
 * Every probe is verified against a known-taken and a known-free name before it
 * is added here. A registry that answers 200 either way (Instagram, TikTok, and
 * GitLab's user API) cannot be checked this way and must not be listed: the
 * failure mode is reporting every name as free, which is the one outcome this
 * product exists to prevent.
 */
import type { AdapterDeps, SourceAdapter } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import type { Evidence, Match, SourceId, SourceResult } from '@/lib/core/types'
import { request } from '@/lib/sources/http'
import { buildResult, makeEvidence, statusFromMatches, unverifiable } from '@/lib/sources/result'
import { normalize } from '@/lib/similarity/normalize'
import { compareNames } from '@/lib/similarity/score'

export interface ExactProbeSpec {
  id: SourceId
  /** How the registry is named to a person. */
  label: string
  /** The endpoint that answers whether the name is claimed. */
  probe: (name: string) => string
  /** The page a person would open to see it. */
  page: (name: string) => string
  /** Value for `Match.categories`, so the report can say what kind of thing it is. */
  kind: string
  /**
   * Status codes meaning "claimed". Everything else that is not a 404 is
   * treated as no answer rather than as a free name.
   */
  claimedStatuses?: number[]
  /**
   * Status codes meaning "free", where the registry does not use 404.
   *
   * last.fm answers 600 for a username nobody holds. Listing it explicitly
   * keeps the safety rule intact: anything *not* named here is still treated
   * as no answer rather than as good news.
   */
  freeStatuses?: number[]
  /**
   * `HEAD` where the endpoint supports it.
   *
   * Several of these answer with a very large body that is then thrown away:
   * Anaconda returns about 5 MB for a package that exists. Asking for headers
   * alone keeps a scan from downloading megabytes to learn one bit. Only set
   * where HEAD was verified to return the same status as GET; Terraform, for
   * one, answers 405.
   */
  method?: 'GET' | 'HEAD'
  /** Extra request headers, where the API insists on one. */
  headers?: Record<string, string>
  /**
   * Decide from the body instead of the status.
   *
   * For endpoints that answer 200 either way and put the answer inside:
   * Hacker News returns the string `null` for a user that does not exist.
   * Returning `undefined` means "no usable answer", which resolves to
   * unverified rather than to a free name.
   */
  claimedFromBody?: (body: string) => boolean | undefined
}

export function exactProbeAdapter(spec: ExactProbeSpec): SourceAdapter {
  const claimed = spec.claimedStatuses ?? [200, 301, 302]
  const free = spec.freeStatuses ?? [404]

  return {
    id: spec.id,

    async run(ctx: ScanContext, deps: AdapterDeps): Promise<SourceResult> {
      const name = normalize(ctx.name)
      if (name.length === 0) {
        return unverifiable(spec.id, 'INVALID_NAME', 'Name contains no usable characters', false)
      }

      let status: number
      let body: string
      try {
        const response = await request(spec.probe(name), {
          signal: deps.signal,
          expectedStatuses: [...new Set([404, 301, 302, ...free])],
          retries: 1,
          ...(spec.method === undefined ? {} : { method: spec.method }),
          ...(spec.headers === undefined ? {} : { headers: spec.headers }),
        })
        status = response.status
        body = response.text
      } catch {
        return unverifiable(spec.id, 'LOOKUP_FAILED', `${spec.label} could not be reached.`, true)
      }

      if (spec.claimedFromBody !== undefined) {
        const verdict = status === 200 ? spec.claimedFromBody(body) : undefined
        if (verdict === undefined) {
          return unverifiable(
            spec.id,
            'UNCLEAR',
            `${spec.label} did not give a usable answer.`,
            true,
          )
        }
        return finish(spec, ctx, name, verdict, deps)
      }

      if (claimed.includes(status)) {
        return finish(spec, ctx, name, true, deps)
      } else if (free.includes(status)) {
        return finish(spec, ctx, name, false, deps)
      } else {
        // Anything unexpected is an absence of information, not good news.
        return unverifiable(
          spec.id,
          'UNCLEAR',
          `${spec.label} answered ${status}, which does not say whether the name is taken.`,
          true,
        )
      }
    },
  }
}

/** Build the result once the yes-or-no is settled, however it was reached. */
function finish(
  spec: ExactProbeSpec,
  ctx: ScanContext,
  name: string,
  taken: boolean,
  deps: AdapterDeps,
): SourceResult {
  const url = spec.page(name)
  const evidence: Evidence[] = []
  const exactMatches: Match[] = []

  if (taken) {
    exactMatches.push({
      externalId: `${spec.id}:${name}`,
      name,
      categories: [spec.kind],
      url,
      similarity: compareNames(ctx.name, name),
      severity: 'high',
      evidence: [makeEvidence(spec.id, `"${name}" is taken on ${spec.label}`, url)],
    })
  } else {
    evidence.push(makeEvidence(spec.id, `No ${spec.label} entry named "${name}"`, url))
  }

  evidence.push(
    makeEvidence(
      spec.id,
      `${spec.label} is checked by exact name only. A similar name would not be found here.`,
    ),
  )

  deps.log(`${spec.id}.checked`, { taken })

  return buildResult({
    source: spec.id,
    status: statusFromMatches(exactMatches, []),
    exactMatches,
    evidence,
  })
}
