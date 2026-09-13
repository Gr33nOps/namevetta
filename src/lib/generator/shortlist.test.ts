import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('./namegen', () => ({ generateNames: vi.fn() }))
vi.mock('@/lib/sources/domain', () => ({ checkCandidateDomain: vi.fn() }))
vi.mock('@/lib/orchestrator/run', () => ({ runScanToCompletion: vi.fn() }))
import { generateNames } from './namegen'
import { checkCandidateDomain } from '@/lib/sources/domain'
import { runScanToCompletion } from '@/lib/orchestrator/run'
import { generateShortlist } from './shortlist'
const names = [
  'Cedar Table',
  'Willow Pantry',
  'Sunday Crumb',
  'Copper Apron',
  'Orchard Oven',
]
const clean = () => ({
  results: [
    {
      source: 'github',
      status: 'no_conflict',
      confidence: 95,
      exactMatches: [],
      similarMatches: [],
      evidence: [],
      checkedAt: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
      fromCache: false,
    },
  ],
  viability: {
    score: 85,
    rawScore: 85,
    caps: [],
    groups: [],
    conflicts: [],
    scoringVersion: 1,
  },
  coverage: 80,
})
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(generateNames).mockResolvedValue({ status: 'ready', names })
  vi.mocked(checkCandidateDomain).mockImplementation(async (name) => ({
    domain: name.replaceAll(' ', '').toLowerCase() + '.com',
    state: 'no_registration',
    note: 'No registration found',
  }))
  vi.mocked(runScanToCompletion).mockImplementation(
    async () => clean() as Awaited<ReturnType<typeof runScanToCompletion>>,
  )
})
it('offers a checked domain variant without changing the brand name', async () => {
  vi.mocked(checkCandidateDomain).mockImplementation(
    async (name, _signal, tld = 'com') => ({
      domain: name.replaceAll(' ', '').toLowerCase() + '.' + tld,
      state: name.startsWith('get ') ? 'no_registration' : 'registered',
      note: '',
    }),
  )
  const result = await generateShortlist({
    category: 'saas',
    description: 'a media tracker',
  })
  expect(result.status).toBe('ready')
  if (result.status === 'ready')
    expect(result.ranked.candidates[0]).toMatchObject({
      name: 'Cedar Table',
      domain: { name: 'getcedartable.com', comState: 'registered' },
    })
})
it('rejects confirmed namespace conflicts even when a domain variant is free', async () => {
  vi.mocked(runScanToCompletion).mockImplementation(
    async () =>
      ({
        ...clean(),
        viability: {
          ...clean().viability,
          score: 35,
          caps: [{ reason: 'Exact conflict confirmed on npm', maximum: 35 }],
        },
      }) as Awaited<ReturnType<typeof runScanToCompletion>>,
  )
  const result = await generateShortlist({
    category: 'saas',
    description: 'a media tracker',
  })
  expect(result.status).toBe('incomplete')
})
it('still rejects an established same-industry business', async () => {
  vi.mocked(runScanToCompletion).mockImplementation(
    async () =>
      ({
        ...clean(),
        viability: {
          ...clean().viability,
          score: 40,
          caps: [{ reason: 'Exact major same-industry business', maximum: 40 }],
        },
      }) as Awaited<ReturnType<typeof runScanToCompletion>>,
  )
  expect(
    (
      await generateShortlist({
        category: 'saas',
        description: 'a media tracker',
      })
    ).status,
  ).toBe('incomplete')
})
it('returns checked progress when no further names pass', async () => {
  vi.mocked(generateNames)
    .mockResolvedValueOnce({ status: 'ready', names: ['Cedar Table'] })
    .mockResolvedValue({ status: 'unavailable', reason: 'Allowance reached' })
  const result = await generateShortlist({
    category: 'restaurant',
    description: 'a bakery',
  })
  expect(result.status).toBe('partial')
  if (result.status === 'partial')
    expect(result.ranked.candidates).toHaveLength(1)
})
it('enforces the overall deadline even when an adapter never resolves', async () => {
  vi.useFakeTimers()
  vi.mocked(generateNames).mockImplementation(() => new Promise(() => {}))
  try {
    const pending = generateShortlist({
      category: 'restaurant',
      description: 'a bakery',
    })
    await vi.advanceTimersByTimeAsync(260000)
    expect((await pending).status).toBe('incomplete')
  } finally {
    vi.useRealTimers()
  }
}, 1000)
it('returns exactly four screened names and stops spending on extras', async () => {
  const result = await generateShortlist({
    category: 'restaurant',
    description: 'A seasonal bakery',
  })
  expect(result.status).toBe('ready')
  if (result.status === 'ready')
    expect(result.ranked.candidates).toHaveLength(4)
  expect(runScanToCompletion).toHaveBeenCalledTimes(4)
})
it('keeps a strong name with a verified alternative and reports its taken com', async () => {
  vi.mocked(checkCandidateDomain).mockImplementation(
    async (name, _signal, tld = 'com') => ({
      domain: name.replaceAll(' ', '').toLowerCase() + '.' + tld,
      state: tld === 'com' ? 'registered' : 'no_registration',
      note: '',
    }),
  )
  vi.mocked(runScanToCompletion).mockImplementation(
    async () =>
      ({
        ...clean(),
        results: [
          ...clean().results,
          {
            ...clean().results[0],
            source: 'domain',
            meta: { canonicalComState: 'registered' },
          },
        ],
      }) as Awaited<ReturnType<typeof runScanToCompletion>>,
  )
  const result = await generateShortlist({
    category: 'saas',
    description: 'a useful app',
  })
  expect(result.status).toBe('ready')
  if (result.status === 'ready')
    expect(result.ranked.candidates[0]?.domain).toMatchObject({
      name: 'cedartable.app',
      comState: 'registered',
    })
})
it('preserves editorial order when presenting equally viable generated names', async () => {
  const result = await generateShortlist({
    category: 'restaurant',
    description: 'A seasonal bakery',
  })
  expect(result.status).toBe('ready')
  if (result.status === 'ready')
    expect(result.ranked.candidates.map((candidate) => candidate.name)).toEqual(
      ['Cedar Table', 'Willow Pantry', 'Sunday Crumb', 'Copper Apron'],
    )
})
it('refills with new directions when a whole pool has occupied domains', async () => {
  vi.mocked(generateNames).mockResolvedValueOnce({
    status: 'ready',
    names: ['Taken Name'],
  })
  vi.mocked(checkCandidateDomain).mockImplementation(
    async (name, _signal, tld = 'com') => ({
      domain: name.replaceAll(' ', '').toLowerCase() + '.' + tld,
      state: name.includes('Taken Name') ? 'registered' : 'no_registration',
      note: '',
    }),
  )
  const result = await generateShortlist({
    category: 'restaurant',
    description: 'A seasonal bakery',
  })
  expect(result.status).toBe('ready')
  expect(generateNames).toHaveBeenNthCalledWith(
    2,
    expect.any(String),
    expect.any(String),
    undefined,
    expect.objectContaining({
      exclude: expect.arrayContaining(['Taken Name']),
    }),
  )
  expect(runScanToCompletion).not.toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Taken Name' }),
    expect.anything(),
  )
})
it('never fills a shortlist with unknown domains or low evidence', async () => {
  vi.mocked(checkCandidateDomain).mockResolvedValueOnce({
    domain: 'cedartable.com',
    state: 'unknown',
    note: 'Timeout',
  })
  vi.mocked(runScanToCompletion).mockImplementation(
    async () =>
      ({ ...clean(), coverage: 15 }) as Awaited<
        ReturnType<typeof runScanToCompletion>
      >,
  )
  const result = await generateShortlist({
    category: 'restaurant',
    description: 'A seasonal bakery',
  })
  expect(result.status).toBe('incomplete')
})
it('does not count duplicates from a refill as additional names', async () => {
  vi.mocked(generateNames).mockResolvedValue({
    status: 'ready',
    names: ['Cedar Table', 'cedar table'],
  })
  expect(
    (
      await generateShortlist({
        category: 'restaurant',
        description: 'A seasonal bakery',
      })
    ).status,
  ).toBe('partial')
  expect(runScanToCompletion).toHaveBeenCalledTimes(1)
})
it('does no provider work after cancellation', async () => {
  await generateShortlist({
    category: 'restaurant',
    description: 'A seasonal bakery',
    signal: AbortSignal.abort(),
  })
  expect(generateNames).not.toHaveBeenCalled()
})

it('rejects a domain that becomes registered during the full scan', async () => {
  vi.mocked(runScanToCompletion).mockImplementation(
    async () =>
      ({
        ...clean(),
        results: [
          {
            ...clean().results[0],
            source: 'domain',
            meta: { canonicalComState: 'registered' },
          },
        ],
      }) as Awaited<ReturnType<typeof runScanToCompletion>>,
  )
  expect(
    (
      await generateShortlist({
        category: 'restaurant',
        description: 'A seasonal bakery',
      })
    ).status,
  ).toBe('incomplete')
})

it('recovers from a transient model failure without losing the run', async () => {
  vi.mocked(generateNames).mockResolvedValueOnce({
    status: 'unavailable',
    reason: 'Busy',
    retryable: true,
    retryAfterMs: 1,
  })
  const progress = vi.fn()
  const result = await generateShortlist({
    category: 'restaurant',
    description: 'A seasonal bakery',
    onProgress: progress,
  })
  expect(result.status).toBe('ready')
  expect(progress).toHaveBeenCalledWith(
    expect.objectContaining({
      message: expect.stringContaining('Retrying automatically'),
    }),
  )
})
it('cancels the automatic retry when the user leaves', async () => {
  const abort = new AbortController()
  vi.mocked(generateNames).mockResolvedValueOnce({
    status: 'unavailable',
    reason: 'Busy',
    retryable: true,
    retryAfterMs: 61000,
  })
  await generateShortlist({
    category: 'restaurant',
    description: 'A seasonal bakery',
    signal: abort.signal,
    onProgress: () => abort.abort(),
  })
  expect(generateNames).toHaveBeenCalledTimes(1)
})

it('can retry a provider cooldown on the last round and keep verified names', async () => {
  vi.mocked(generateNames)
    .mockResolvedValueOnce({ status: 'ready', names: ['Cedar Table'] })
    .mockResolvedValueOnce({ status: 'ready', names: ['Copper Apron'] })
    .mockResolvedValueOnce({ status: 'ready', names: ['Bramble Oven'] })
    .mockResolvedValueOnce({
      status: 'unavailable',
      reason: 'Busy',
      retryable: true,
      retryAfterMs: 1,
    })
    .mockResolvedValueOnce({ status: 'ready', names: ['Willow Basket'] })
  const result = await generateShortlist({
    category: 'restaurant',
    description: 'A seasonal bakery',
  })
  expect(result.status).toBe('ready')
  expect(runScanToCompletion).toHaveBeenCalledTimes(4)
})

it('checks two candidates concurrently and preserves editorial order', async () => {
  let active = 0
  let peak = 0
  vi.mocked(runScanToCompletion).mockImplementation(async () => {
    active++
    peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, 5))
    active--
    return clean() as Awaited<ReturnType<typeof runScanToCompletion>>
  })
  const result = await generateShortlist({category:'saas',description:'a media tracker'})
  expect(peak).toBe(2)
  if(result.status==='ready') expect(result.ranked.candidates.map(c=>c.name)).toEqual(names.slice(0,4))
})
it('passes rejected screening findings into the next naming request', async () => {
  vi.mocked(generateNames).mockResolvedValueOnce({status:'ready',names:['Taken Name']})
  vi.mocked(runScanToCompletion).mockResolvedValueOnce({...clean(),viability:{...clean().viability,score:35,caps:[{reason:'Exact conflict confirmed on npm',maximum:35}]}} as Awaited<ReturnType<typeof runScanToCompletion>>)
  await generateShortlist({category:'saas',description:'a media tracker'})
  expect(generateNames).toHaveBeenNthCalledWith(2,expect.any(String),expect.any(String),undefined,expect.objectContaining({screeningFeedback:expect.arrayContaining([expect.objectContaining({name:'Taken Name',reason:expect.stringContaining('conflict')})])}))
})
