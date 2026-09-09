/**
 * VS Code Marketplace check.
 *
 * The gallery `extensionquery` endpoint is what the marketplace's own front end
 * calls: a POST with a filter document, public and unauthenticated. An
 * extension is addressed as `publisher.name`, so like Packagist there is no
 * single URL for a bare name, and search is the honest way to ask.
 */
import type { AdapterDeps, SourceAdapter } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import type { Evidence, Match, SourceResult } from '@/lib/core/types'
import { request, SourceRequestError } from '@/lib/sources/http'
import { buildResult, makeEvidence, statusFromMatches, unverifiable } from '@/lib/sources/result'
import { severityFor } from '@/lib/sources/severity'
import { normalize } from '@/lib/similarity/normalize'
import { compareNames } from '@/lib/similarity/score'

const API = 'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery'
const SIMILARITY_FLOOR = 65

interface Extension {
  extensionName?: string
  displayName?: string
  shortDescription?: string
  publisher?: { publisherName?: string }
}

export const vscodeMarketplaceAdapter: SourceAdapter = {
  id: 'vscode_marketplace',

  async run(ctx: ScanContext, deps: AdapterDeps): Promise<SourceResult> {
    const name = normalize(ctx.name)
    if (name.length === 0) {
      return unverifiable(
        'vscode_marketplace',
        'INVALID_NAME',
        'Name contains no usable characters',
        false,
      )
    }

    let extensions: Extension[]
    try {
      const response = await request(API, {
        method: 'POST',
        signal: deps.signal,
        retries: 1,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json;api-version=3.0-preview.1',
        },
        // filterType 10 is the marketplace's own free-text search filter.
        body: JSON.stringify({
          filters: [{ criteria: [{ filterType: 10, value: ctx.name }], pageSize: 15 }],
          flags: 914,
        }),
      })
      const parsed = JSON.parse(response.text) as { results?: { extensions?: Extension[] }[] }
      extensions = parsed.results?.[0]?.extensions ?? []
    } catch (cause) {
      const err = cause instanceof SourceRequestError ? cause : undefined
      return unverifiable(
        'vscode_marketplace',
        err?.code ?? 'LOOKUP_FAILED',
        'The VS Code Marketplace could not be reached.',
        true,
      )
    }

    const exactMatches: Match[] = []
    const similarMatches: Match[] = []

    for (const ext of extensions) {
      const label = ext.displayName ?? ext.extensionName
      if (label === undefined || ext.extensionName === undefined) continue
      const similarity = compareNames(ctx.name, ext.extensionName)
      if (similarity.overall < SIMILARITY_FLOOR) continue

      const publisher = ext.publisher?.publisherName
      const url =
        publisher === undefined
          ? undefined
          : `https://marketplace.visualstudio.com/items?itemName=${publisher}.${ext.extensionName}`

      const match: Match = {
        externalId: `${publisher ?? '?'}.${ext.extensionName}`,
        name: label,
        categories: ['vs code extension'],
        similarity,
        severity: severityFor(similarity),
        evidence: [makeEvidence('vscode_marketplace', `"${label}" is published`, url)],
        ...(publisher === undefined ? {} : { owner: publisher }),
        ...(url === undefined ? {} : { url }),
        ...(ext.shortDescription === undefined ? {} : { description: ext.shortDescription }),
      }

      if (normalize(ext.extensionName) === name) exactMatches.push(match)
      else similarMatches.push(match)
    }

    const evidence: Evidence[] = [
      makeEvidence(
        'vscode_marketplace',
        `Searched the marketplace and read ${extensions.length} results`,
      ),
    ]
    if (exactMatches.length === 0 && similarMatches.length === 0) {
      evidence.push(makeEvidence('vscode_marketplace', `No VS Code extension matching "${ctx.name}"`))
    }

    deps.log('vscode_marketplace.checked', {
      results: extensions.length,
      similar: similarMatches.length,
    })

    return buildResult({
      source: 'vscode_marketplace',
      status: statusFromMatches(exactMatches, similarMatches),
      exactMatches,
      similarMatches,
      evidence,
    })
  },
}
