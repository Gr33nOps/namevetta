/**
 * GitHub namespace and repository checks (§8).
 *
 * Uses authenticated requests when a token is present — 5,000 requests/hour
 * versus 60 unauthenticated, which is the difference between a usable public
 * service and one that breaks under any real traffic. Without a token the
 * adapter still works; it simply has a much smaller budget.
 */
import type { AdapterDeps, SourceAdapter } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import type { Evidence, Match, SourceResult } from '@/lib/core/types'
import { env } from '@/lib/env'
import { requestJson, SourceRequestError } from '@/lib/sources/http'
import { buildResult, makeEvidence, statusFromMatches, unverifiable } from '@/lib/sources/result'
import { normalize } from '@/lib/similarity/normalize'
import { compareNames } from '@/lib/similarity/score'
import { severityFor } from '@/lib/sources/severity'

const API = 'https://api.github.com'

interface GhAccount {
  login: string
  type: string
  html_url: string
  name?: string | null
  bio?: string | null
  description?: string | null
  public_repos?: number
  followers?: number
  updated_at?: string
}

/** A registration this old, with no repos and no followers, reads as a placeholder. */
const DORMANT_AGE_MS = 2 * 365 * 24 * 60 * 60 * 1000

/**
 * Whether an account looks like an abandoned placeholder rather than someone
 * actually operating under the name.
 *
 * Both fields already ride along in the same `/users/:login` response this
 * adapter already fetches, so this costs nothing extra. Conservative by
 * design: an account with any repos or any followers is never downgraded,
 * and one with neither is only downgraded once its profile has also gone two
 * years without an update — a brand-new empty account is not dormant, it's
 * just new.
 */
function isDormant(account: GhAccount): boolean {
  if ((account.public_repos ?? 0) > 0 || (account.followers ?? 0) > 0) return false
  if (account.updated_at === undefined) return false
  const updatedAt = Date.parse(account.updated_at)
  if (Number.isNaN(updatedAt)) return false
  return Date.now() - updatedAt > DORMANT_AGE_MS
}

interface GhRepo {
  full_name: string
  html_url: string
  description: string | null
  stargazers_count: number
  archived: boolean
  owner: { login: string }
}

interface GhSearch {
  items?: GhRepo[]
}

function headers(): Record<string, string> {
  const token = env().GITHUB_TOKEN
  const base: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  }
  if (token !== undefined) base.authorization = `Bearer ${token}`
  return base
}

export const githubAdapter: SourceAdapter = {
  id: 'github',

  async run(ctx: ScanContext, deps: AdapterDeps): Promise<SourceResult> {
    const handle = normalize(ctx.name)
    if (handle.length === 0) {
      return unverifiable('github', 'INVALID_NAME', 'Name contains no usable characters', false)
    }

    const evidence: Evidence[] = []
    const exactMatches: Match[] = []
    const similarMatches: Match[] = []

    // 1. Exact account (covers both users and organizations — GitHub shares one
    //    namespace between them, so a single lookup answers both).
    try {
      const { status, data } = await requestJson<GhAccount>(`${API}/users/${handle}`, {
        signal: deps.signal,
        headers: headers(),
        expectedStatuses: [404],
      })

      if (status === 404) {
        evidence.push(makeEvidence('github', `No GitHub user or organization named ${handle}`))
      } else if (data !== undefined) {
        const description = data.bio ?? data.description ?? data.name ?? undefined
        const dormant = isDormant(data)
        const accountEvidence = [makeEvidence('github', `${data.type} @${data.login} exists`, data.html_url)]
        if (dormant) {
          accountEvidence.push(
            makeEvidence(
              'github',
              `No public repositories, no followers, and no profile update since ${data.updated_at}. Reads as an unused placeholder, not active use.`,
            ),
          )
        }
        exactMatches.push({
          externalId: data.login,
          name: data.login,
          categories: [data.type],
          active: !dormant,
          url: data.html_url,
          similarity: compareNames(ctx.name, data.login),
          severity: dormant ? 'medium' : 'high',
          evidence: accountEvidence,
          ...(description === undefined || description === null ? {} : { description }),
        })
      }
    } catch (cause) {
      const err = cause instanceof SourceRequestError ? cause : undefined
      // A rate-limit or outage here means we cannot speak to the namespace at
      // all, which is a whole-source failure rather than a partial answer.
      return unverifiable(
        'github',
        err?.code ?? 'ACCOUNT_LOOKUP_FAILED',
        err?.status === 403 || err?.status === 429
          ? 'GitHub rate limit reached. Add a GITHUB_TOKEN to raise it.'
          : 'GitHub account lookup failed.',
        true,
      )
    }

    // 2. Repositories with a similar name. Best-effort: a failure here still
    //    leaves the namespace answer above intact, so it degrades to a note.
    try {
      const query = encodeURIComponent(`${handle} in:name`)
      const { data } = await requestJson<GhSearch>(
        `${API}/search/repositories?q=${query}&per_page=20&sort=stars`,
        { signal: deps.signal, headers: headers(), expectedStatuses: [404, 422] },
      )

      for (const repo of data?.items ?? []) {
        const repoName = repo.full_name.split('/')[1] ?? repo.full_name
        if (normalize(repoName) === handle && repo.owner.login === handle) continue

        const similarity = compareNames(ctx.name, repoName)
        if (similarity.overall < 60) continue

        similarMatches.push({
          externalId: repo.full_name,
          name: repo.full_name,
          owner: repo.owner.login,
          categories: ['repository'],
          active: !repo.archived,
          url: repo.html_url,
          similarity,
          severity: severityFor(similarity, { active: !repo.archived }),
          evidence: [
            makeEvidence(
              'github',
              `${repo.full_name} (${repo.stargazers_count} stars)`,
              repo.html_url,
            ),
          ],
          ...(repo.description === null ? {} : { description: repo.description }),
        })
      }
      evidence.push(
        makeEvidence('github', `Searched repositories for names containing "${handle}"`),
      )
    } catch {
      evidence.push(
        makeEvidence('github', 'Repository search did not complete; namespace result above still applies'),
      )
    }

    deps.log('github.checked', { exact: exactMatches.length, similar: similarMatches.length })

    return buildResult({
      source: 'github',
      status: statusFromMatches(exactMatches, similarMatches),
      exactMatches,
      similarMatches,
      evidence,
    })
  },
}
