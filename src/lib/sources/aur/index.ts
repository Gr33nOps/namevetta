/** Public AUR package lookup, used only for developer-tool names. */
import { z } from 'zod'
import type { AdapterDeps, SourceAdapter } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import type { Evidence, Match, SourceResult } from '@/lib/core/types'
import { requestJson } from '@/lib/sources/http'
import { buildResult, makeEvidence, requestFailure, statusFromMatches, unverifiable } from '@/lib/sources/result'
import { normalize } from '@/lib/similarity/normalize'
import { compareNames } from '@/lib/similarity/score'

const AUR = 'https://aur.archlinux.org'
const APPLICABLE_CATEGORIES = ['developer_tool'] as const

const ResponseSchema = z.object({
  resultcount: z.number().int().nonnegative(),
  results: z.array(
    z.object({
      ID: z.number().int().positive(),
      Name: z.string().min(1),
      Description: z.string().nullable().optional(),
    }),
  ),
})

function packageName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-')
}

export const aurAdapter: SourceAdapter = {
  id: 'aur',

  async run(ctx: ScanContext, deps: AdapterDeps): Promise<SourceResult> {
    if (!ctx.includeSpecialized && !(APPLICABLE_CATEGORIES as readonly string[]).includes(ctx.category)) {
      return unverifiable('aur', 'NOT_APPLICABLE', 'AUR is checked for developer-tool names only.', false)
    }

    const candidate = packageName(ctx.name)
    if (candidate === '') return unverifiable('aur', 'INVALID_NAME', 'Name contains no usable characters.', false)

    let data: z.infer<typeof ResponseSchema> | undefined
    try {
      const response = await requestJson<unknown>(`${AUR}/rpc/v5/info/${encodeURIComponent(candidate)}`, {
        signal: deps.signal,
        retries: 1,
      })
      const parsed = ResponseSchema.safeParse(response.data)
      if (!parsed.success || parsed.data.resultcount !== parsed.data.results.length) {
        return unverifiable('aur', 'MALFORMED_RESPONSE', 'AUR returned an unexpected response.', false)
      }
      data = parsed.data
    } catch (cause) {
      return requestFailure('aur', 'AUR', cause)
    }

    const exactMatches: Match[] = data.results
      .filter((item) => normalize(item.Name) === normalize(ctx.name))
      .map((item) => {
        const url = `${AUR}/packages/${encodeURIComponent(item.Name)}/`
        return {
          externalId: String(item.ID),
          name: item.Name,
          categories: ['arch package'],
          ...(item.Description === null || item.Description === undefined ? {} : { description: item.Description }),
          url,
          similarity: compareNames(ctx.name, item.Name),
          severity: 'high' as const,
          evidence: [makeEvidence('aur', `AUR package "${item.Name}"`, url)],
        }
      })

    const evidence: Evidence[] = exactMatches.length > 0
      ? [makeEvidence('aur', `Checked the AUR package name "${candidate}".`)]
      : [makeEvidence('aur', `No AUR package named "${candidate}".`)]
    evidence.push(makeEvidence('aur', 'AUR is checked by exact package name only.'))

    deps.log('aur.checked', { taken: exactMatches.length > 0 })
    return buildResult({
      source: 'aur',
      status: statusFromMatches(exactMatches, []),
      exactMatches,
      evidence,
    })
  },
}
