/**
 * The sources a production audit found lying, and the shapes that made them.
 *
 * Every case here is a real response observed against the live endpoint, not
 * an imagined one. They are collected in one file because they share a lesson:
 * **a probe verified only against a name that is taken cannot be trusted.**
 * metacpan answered 200 for a module nobody has published, so CPAN reported a
 * confirmed conflict for every name it ever saw. Both directions have to be
 * checked, and both are checked here.
 *
 * The failure cases matter as much as the answers: a 403, a 429, a 5xx, a
 * timeout, a login wall and a body we cannot parse must every one of them
 * produce `unable_to_verify`, never `no_conflict`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdapterDeps } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import { SourceResultSchema, type SourceResult } from '@/lib/core/types'
import { resetEnvCache } from '@/lib/env'
import { bitbucketAdapter } from '@/lib/sources/bitbucket'
import { cpanAdapter } from '@/lib/sources/cpan'
import { hackageAdapter } from '@/lib/sources/hackage'
import { mavenCentralAdapter } from '@/lib/sources/maven_central'
import { slackAdapter } from '@/lib/sources/slack'

const ctx: ScanContext = { name: 'Envryn', category: 'developer_tool', scanType: 'quick' }
const deps = (): AdapterDeps => ({ signal: new AbortController().signal, log: () => {} })

/** Every URL the adapter asked for during the current test. */
const requested: string[] = []

/**
 * One canned response for every request the adapter makes.
 *
 * The URLs go into `requested` rather than being read back off the mock's
 * call list: the handler takes no arguments, so its inferred call tuple is
 * empty and indexing it is a type error.
 */
function reply(status: number, body: string, contentType = 'application/json') {
  return vi.fn(async (input: RequestInfo | URL) => {
    requested.push(typeof input === 'string' ? input : input.toString())
    return new Response(body, { status, headers: { 'content-type': contentType } })
  })
}

/** A network-level failure, which is what a timeout looks like from here. */
function throwing(error: Error) {
  return vi.fn(async () => {
    throw error
  })
}

beforeEach(() => {
  requested.length = 0
  resetEnvCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  resetEnvCache()
})

/**
 * Every result an adapter returns must pass the boundary schema, and an
 * unverified one must never carry a conflict. Asserted on every case below.
 */
function expectWellFormed(result: SourceResult): void {
  const parsed = SourceResultSchema.safeParse(result)
  expect(parsed.success, JSON.stringify(parsed.error?.issues ?? [])).toBe(true)
  if (result.status === 'unable_to_verify') {
    expect(result.error).toBeDefined()
    expect(result.confidence).toBe(0)
    expect(result.exactMatches).toHaveLength(0)
  }
}

/* -------------------------------------------------------------------------- */
/* CPAN                                                                       */
/* -------------------------------------------------------------------------- */

const cpanHit = JSON.stringify({
  hits: { total: 292, hits: [{ _source: { distribution: 'Moose' } }] },
})
const cpanMiss = JSON.stringify({ hits: { total: 0, hits: [] } })

describe('CPAN', () => {
  it('reports a published distribution as a confirmed conflict', async () => {
    vi.stubGlobal('fetch', reply(200, cpanHit))
    const result = await cpanAdapter.run(ctx, deps())
    expectWellFormed(result)
    expect(result.status).toBe('confirmed_conflict')
    // The registry's own spelling, not the lowercased form we searched with.
    expect(result.exactMatches[0]?.name).toBe('Moose')
  })

  /*
    The regression that matters. `metacpan.org/pod/{name}` answers 200 with an
    application shell for a module nobody has published, so the old
    status-code probe reported a confirmed conflict on 71 of 71 production
    scans — a 100% conflict rate across eleven unrelated names.
  */
  it('reports an unpublished distribution as no conflict', async () => {
    vi.stubGlobal('fetch', reply(200, cpanMiss))
    const result = await cpanAdapter.run(ctx, deps())
    expectWellFormed(result)
    expect(result.status).toBe('no_conflict')
  })

  it('is case-insensitive, because the name reaching it is already lowercased', async () => {
    vi.stubGlobal('fetch', reply(200, cpanMiss))
    await cpanAdapter.run({ ...ctx, name: 'MOOSE' }, deps())
    const url = requested[0] ?? ''
    // `/distribution/{name}` is case-sensitive upstream; probing it directly
    // would have reported every lowercased name as free.
    expect(url).toContain('distribution.lowercase')
  })

  it('treats a body it cannot read as no answer, never as a free name', async () => {
    vi.stubGlobal('fetch', reply(200, '{"hits":{"unexpected":true}}'))
    const result = await cpanAdapter.run(ctx, deps())
    expectWellFormed(result)
    expect(result.status).toBe('unable_to_verify')
    expect(result.error?.code).toBe('MALFORMED_RESPONSE')
  })

  it('treats an HTML error page as no answer', async () => {
    vi.stubGlobal('fetch', reply(200, '<html><body>Gateway</body></html>', 'text/html'))
    const result = await cpanAdapter.run(ctx, deps())
    expectWellFormed(result)
    expect(result.status).toBe('unable_to_verify')
  })

  for (const status of [403, 429, 500, 503]) {
    it(`treats ${status} as no answer`, async () => {
      vi.stubGlobal('fetch', reply(status, '{}'))
      const result = await cpanAdapter.run(ctx, deps())
      expectWellFormed(result)
      expect(result.status).toBe('unable_to_verify')
    })
  }

  it('treats a timeout as no answer', async () => {
    const abort = new Error('The operation was aborted')
    abort.name = 'AbortError'
    vi.stubGlobal('fetch', throwing(abort))
    const result = await cpanAdapter.run(ctx, deps())
    expectWellFormed(result)
    expect(result.status).toBe('unable_to_verify')
  })
})

/* -------------------------------------------------------------------------- */
/* Maven Central                                                              */
/* -------------------------------------------------------------------------- */

describe('Maven Central', () => {
  it('reports a published artifact as a confirmed conflict', async () => {
    vi.stubGlobal('fetch', reply(200, JSON.stringify({ response: { numFound: 4 } })))
    const result = await mavenCentralAdapter.run(ctx, deps())
    expectWellFormed(result)
    expect(result.status).toBe('confirmed_conflict')
  })

  it('reports an unused artifact id as no conflict', async () => {
    vi.stubGlobal('fetch', reply(200, JSON.stringify({ response: { numFound: 0 } })))
    const result = await mavenCentralAdapter.run(ctx, deps())
    expectWellFormed(result)
    expect(result.status).toBe('no_conflict')
  })

  it('queries the Sonatype host, which answered every request in sampling', async () => {
    vi.stubGlobal('fetch', reply(200, JSON.stringify({ response: { numFound: 0 } })))
    await mavenCentralAdapter.run(ctx, deps())
    // `search.maven.org` timed out on a third of sampled requests and was
    // failing six lookups in ten in production.
    expect(requested[0] ?? '').toContain('central.sonatype.com')
  })

  it('treats malformed JSON as no answer', async () => {
    vi.stubGlobal('fetch', reply(200, '{ this is not json'))
    const result = await mavenCentralAdapter.run(ctx, deps())
    expectWellFormed(result)
    expect(result.status).toBe('unable_to_verify')
  })

  it('treats a response with no count as no answer', async () => {
    vi.stubGlobal('fetch', reply(200, JSON.stringify({ response: {} })))
    const result = await mavenCentralAdapter.run(ctx, deps())
    expectWellFormed(result)
    expect(result.status).toBe('unable_to_verify')
  })

  it('treats a 503 as no answer', async () => {
    vi.stubGlobal('fetch', reply(503, 'Service Unavailable', 'text/plain'))
    const result = await mavenCentralAdapter.run(ctx, deps())
    expectWellFormed(result)
    expect(result.status).toBe('unable_to_verify')
    expect(result.error?.code).toBe('UPSTREAM_ERROR')
  })
})

/* -------------------------------------------------------------------------- */
/* Bitbucket                                                                  */
/* -------------------------------------------------------------------------- */

describe('Bitbucket', () => {
  it('reports an existing workspace as a confirmed conflict', async () => {
    vi.stubGlobal(
      'fetch',
      reply(200, JSON.stringify({ type: 'workspace', slug: 'envryn', name: 'Envryn' })),
    )
    const result = await bitbucketAdapter.run(ctx, deps())
    expectWellFormed(result)
    expect(result.status).toBe('confirmed_conflict')
  })

  it('reports a free workspace slug as no conflict', async () => {
    vi.stubGlobal(
      'fetch',
      reply(404, JSON.stringify({ error: { message: "No workspace with identifier 'envryn'." } })),
    )
    const result = await bitbucketAdapter.run(ctx, deps())
    expectWellFormed(result)
    expect(result.status).toBe('no_conflict')
  })

  /*
    A workspace deactivated for inactivity answers 403, and the slug is still
    held. The old adapter let 403 throw, which is where roughly a quarter of
    Bitbucket lookups went.
  */
  it('reads a deactivated workspace as taken, not as a failure', async () => {
    vi.stubGlobal(
      'fetch',
      reply(
        403,
        JSON.stringify({
          error: {
            message:
              'Error: This workspace and its content have been deactivated due to inactivity.',
          },
        }),
      ),
    )
    const result = await bitbucketAdapter.run(ctx, deps())
    expectWellFormed(result)
    expect(result.status).toBe('confirmed_conflict')
  })

  it('treats a 403 that names no workspace as no answer', async () => {
    vi.stubGlobal('fetch', reply(403, JSON.stringify({ error: { message: 'Forbidden' } })))
    const result = await bitbucketAdapter.run(ctx, deps())
    expectWellFormed(result)
    expect(result.status).toBe('unable_to_verify')
  })

  it('treats a 404 that is not Atlassian’s own wording as no answer', async () => {
    // A CDN 404, or a route that has moved, is not a statement about the slug.
    vi.stubGlobal('fetch', reply(404, '<html>Not Found</html>', 'text/html'))
    const result = await bitbucketAdapter.run(ctx, deps())
    expectWellFormed(result)
    expect(result.status).toBe('unable_to_verify')
  })

  it('treats a 429 as rate limiting, distinct from breakage', async () => {
    vi.stubGlobal('fetch', reply(429, '', 'text/plain'))
    const result = await bitbucketAdapter.run(ctx, deps())
    expectWellFormed(result)
    expect(result.error?.code).toBe('RATE_LIMITED')
  })
})

/* -------------------------------------------------------------------------- */
/* Slack                                                                      */
/* -------------------------------------------------------------------------- */

describe('Slack', () => {
  it('never asserts anything automatically', async () => {
    // No fetch is stubbed: a call would throw, which is the point.
    const result = await slackAdapter.run(ctx, deps())
    expectWellFormed(result)
    expect(result.status).toBe('manual_check_recommended')
    expect(result.confidence).toBe(0)
    expect(result.exactMatches).toHaveLength(0)
  })

  it('hands over the URL a person would open', async () => {
    const result = await slackAdapter.run(ctx, deps())
    expect(result.evidence.some((e) => e.url === 'https://envryn.slack.com')).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* Hackage                                                                    */
/* -------------------------------------------------------------------------- */

describe('Hackage', () => {
  // One failed lookup in 71 production scans: no systematic issue, so nothing
  // was changed. These pin the behaviour so a change would be noticed.
  it('reports a published package as a confirmed conflict', async () => {
    vi.stubGlobal('fetch', reply(200, JSON.stringify({ 'package-name': 'envryn' })))
    const result = await hackageAdapter.run(ctx, deps())
    expectWellFormed(result)
    expect(result.status).toBe('confirmed_conflict')
  })

  it('reports an unpublished package as no conflict', async () => {
    vi.stubGlobal('fetch', reply(404, 'Package not found', 'text/plain'))
    const result = await hackageAdapter.run(ctx, deps())
    expectWellFormed(result)
    expect(result.status).toBe('no_conflict')
  })

  it('treats a 500 as no answer', async () => {
    vi.stubGlobal('fetch', reply(500, 'boom', 'text/plain'))
    const result = await hackageAdapter.run(ctx, deps())
    expectWellFormed(result)
    expect(result.status).toBe('unable_to_verify')
  })
})
