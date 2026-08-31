/** Public Roblox username lookup for game and creator names. */
import { z } from 'zod'
import type { AdapterDeps, SourceAdapter } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import type { Evidence, Match, SourceResult } from '@/lib/core/types'
import { requestJson } from '@/lib/sources/http'
import { buildResult, makeEvidence, requestFailure, statusFromMatches, unverifiable } from '@/lib/sources/result'
import { normalize } from '@/lib/similarity/normalize'
import { compareNames } from '@/lib/similarity/score'

const APPLICABLE_CATEGORIES = ['game', 'creator_brand'] as const
const ResponseSchema = z.object({
  data: z.array(z.object({ id: z.number().int().positive(), name: z.string().min(1), displayName: z.string().optional() })),
})

export const robloxAdapter: SourceAdapter = {
  id: 'roblox',

  async run(ctx: ScanContext, deps: AdapterDeps): Promise<SourceResult> {
    if (!ctx.includeSpecialized && !(APPLICABLE_CATEGORIES as readonly string[]).includes(ctx.category)) {
      return unverifiable('roblox', 'NOT_APPLICABLE', 'Roblox is checked for game and creator names only.', false)
    }

    const username = normalize(ctx.name)
    if (username === '') return unverifiable('roblox', 'INVALID_NAME', 'Name contains no usable characters.', false)

    let data: z.infer<typeof ResponseSchema> | undefined
    try {
      const response = await requestJson<unknown>('https://users.roblox.com/v1/usernames/users', {
        method: 'POST',
        body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
        headers: { 'content-type': 'application/json' },
        signal: deps.signal,
        retries: 1,
      })
      const parsed = ResponseSchema.safeParse(response.data)
      if (!parsed.success) return unverifiable('roblox', 'MALFORMED_RESPONSE', 'Roblox returned an unexpected response.', false)
      data = parsed.data
    } catch (cause) {
      return requestFailure('roblox', 'Roblox', cause)
    }

    const exactMatches: Match[] = data.data
      .filter((item) => normalize(item.name) === username)
      .map((item) => {
        const url = `https://www.roblox.com/users/${item.id}/profile`
        return {
          externalId: String(item.id),
          name: item.name,
          categories: ['Roblox account'],
          ...(item.displayName === undefined ? {} : { description: `Display name: ${item.displayName}` }),
          url,
          similarity: compareNames(ctx.name, item.name),
          severity: 'high' as const,
          evidence: [makeEvidence('roblox', `Roblox username "${item.name}"`, url)],
        }
      })

    const evidence: Evidence[] = exactMatches.length > 0
      ? [makeEvidence('roblox', `Checked the Roblox username "${username}".`)]
      : [makeEvidence('roblox', `No Roblox account uses the username "${username}".`)]
    evidence.push(makeEvidence('roblox', 'Roblox usernames can change. This confirms the account at the time checked.'))

    deps.log('roblox.checked', { taken: exactMatches.length > 0 })
    return buildResult({
      source: 'roblox',
      status: statusFromMatches(exactMatches, []),
      exactMatches,
      evidence,
    })
  },
}
