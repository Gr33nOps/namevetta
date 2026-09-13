import { beforeEach, expect, it, vi } from 'vitest'
import { generateNames } from './namegen'
import { LLMUnavailableError } from '@/lib/providers/llm'
const complete = vi.hoisted(() => vi.fn())
vi.mock('@/lib/providers/fallback', () => ({ completeWithFallback: complete }))
const reply = (value: unknown) => ({
  text: JSON.stringify(value),
  model: 'test',
  promptTokens: 1,
  completionTokens: 1,
})
const analysis = {
  purpose: 'Remember experiences',
  audience: 'Media fans',
  concepts: ['memory', 'taste'],
  emotions: ['belonging'],
  vocabulary: ['shelf', 'ticket'],
  territories: [
    'personal history',
    'collection',
    'story',
    'taste',
    'discovery',
    'culture',
  ],
}
beforeEach(() => {
  complete.mockReset()
})
it('finishes cancellation even when a provider ignores its abort signal', async () => {
  complete.mockImplementation(() => new Promise(() => {}))
  const controller = new AbortController()
  const result = generateNames('Website', 'media tracker', undefined, {
    signal: controller.signal,
  })
  controller.abort()
  expect((await result).status).toBe('unavailable')
}, 1000)
it('does not present CamelCase root variations as different directions', async () => {
  complete.mockImplementation(async (request) => {
    const input = JSON.parse(request.user)
    if (input.stage === 'analyze') return reply(analysis)
    if (input.stage === 'explore')
      return reply({ names: ['CandleDrawer', 'CandleWish', 'Yearbook'] })
    return reply({
      reviews: input.names.map((name: string, id: number) => ({
        id,
        scores: Array(9).fill(9),
        territory: name,
        issue: '',
      })),
    })
  })
  expect(await generateNames('Website', 'birthday history', undefined)).toEqual(
    { status: 'ready', names: ['CandleDrawer', 'Yearbook'] },
  )
})
it('preserves reviewed names when optional refinement exhausts the provider allowance', async () => {
  const good = [
    'Shelfmark',
    'After the Credits',
    'Ticket Drawer',
    'Second Sitting',
  ]
  complete.mockImplementation(async (request) => {
    const input = JSON.parse(request.user)
    if (input.stage === 'analyze') return reply(analysis)
    if (input.stage === 'explore')
      return reply({
        names: [
          ...good,
          ...Array.from(
            { length: 16 },
            (_, i) => `Paper ${String.fromCharCode(97 + i)}garden`,
          ),
        ],
      })
    if (input.stage === 'refine')
      throw new LLMUnavailableError('budget_exhausted', 'allowance reached')
    return reply({
      reviews: input.names.map((name: string, id: number) => ({
        id,
        scores: Array(9).fill(good.includes(name) ? 9 : 4),
        territory: name,
        issue: '',
      })),
    })
  })
  expect(await generateNames('Website', 'media tracker', undefined)).toEqual({
    status: 'ready',
    names: good,
  })
})
it('repairs a weak pool without lowering the editorial quality threshold', async () => {
  let explorations = 0
  complete.mockImplementation(async (request) => {
    const input = JSON.parse(request.user)
    if (input.stage === 'analyze') return reply(analysis)
    if (input.stage === 'explore')
      return reply({
        names: Array.from(
          { length: 20 },
          (_, i) =>
            `Paper ${String.fromCharCode(97 + explorations)}${String.fromCharCode(97 + i)}garden`,
        ),
      })
    if (input.stage === 'refine') {
      expect(input.exclude.length).toBeGreaterThan(0)
      expect(
        input.rejected.some((entry: { weaknesses: string[] }) =>
          entry.weaknesses.includes('relevance'),
        ),
      ).toBe(true)
      return reply({
        names: [
          'After the Credits',
          'Shelfmark',
          'Second Sitting',
          'Ticket Drawer',
        ],
      })
    }
    explorations++
    return reply({
      reviews: input.names.map((name: string, id: number) => ({
        id,
        scores: Array(9).fill(name.startsWith('Paper') ? 4 : 9),
        territory: name,
        issue: '',
      })),
    })
  })
  expect(await generateNames('Website', 'media tracker', undefined)).toEqual({
    status: 'ready',
    names: [
      'After the Credits',
      'Shelfmark',
      'Second Sitting',
      'Ticket Drawer',
    ],
  })
})
it('keeps valid editorial decisions when another row has an invalid territory', async () => {
  complete.mockImplementation(async (request) => {
    const input = JSON.parse(request.user)
    if (input.stage === 'analyze')
      return reply({
        ...analysis,
        territories: analysis.territories.map(
          (t) => t + ': ' + 'meaningful context '.repeat(6),
        ),
      })
    if (input.stage === 'explore')
      return reply({ names: ['Shelfmark', 'After the Credits'] })
    return reply({
      reviews: [
        [0, [9, 9, 9, 9, 9, 9, 9, 9, 9], 1, true],
        [1, [9, 9, 9, 9, 9, 9, 9, 9, 9], 99, false],
      ],
    })
  })
  expect(await generateNames('Website', 'media tracker', undefined)).toEqual({
    status: 'ready',
    names: ['Shelfmark'],
  })
})
it('deduplicates and bounds analysis vocabulary instead of failing a valid brief', async () => {
  complete.mockImplementation(async (request) => {
    const input = JSON.parse(request.user)
    if (input.stage === 'analyze')
      return reply({
        ...analysis,
        vocabulary: Array(30).fill('shelf').concat('ticket'),
      })
    if (input.stage === 'explore') {
      expect(input.analysis.vocabulary).toEqual(['shelf', 'ticket'])
      return reply({ names: ['Shelfmark'] })
    }
    return reply({ reviews: [[0, [9, 9, 9, 9, 9, 9, 9, 9, 9], 1, true]] })
  })
  expect(
    (await generateNames('Website', 'media tracker', undefined)).status,
  ).toBe('ready')
})
it('passes an explicit analysis into exploration and preserves contextual editorial ranking', async () => {
  complete.mockImplementation(async (request) => {
    const input = JSON.parse(request.user)
    if (input.stage === 'analyze') return reply(analysis)
    if (input.stage === 'explore') {
      expect(input.analysis.purpose).toBe('Remember experiences')
      return reply({
        names: [
          'After the Credits',
          'Shelfmark',
          'MediaFlow',
          'MediaHub',
          'ProgressPulse',
        ],
      })
    }
    if (input.stage === 'critique')
      return reply({
        reviews: input.names.map((name: string, id: number) => ({
          id,
          scores:
            name === 'After the Credits'
              ? [9, 9, 9, 9, 9, 9, 9, 9, 9]
              : [8, 8, 8, 8, 8, 8, 8, 8, 8],
          territory: name === 'After the Credits' ? 'story' : 'collection',
          issue: '',
        })),
      })
    throw new Error('Unexpected stage')
  })
  const result = await generateNames(
    'Website',
    'media tracking website',
    undefined,
    { maxAttempts: 1, curate: true },
  )
  expect(result.status).toBe('ready')
  if (result.status === 'ready') {
    expect(result.names[0]).toBe('After the Credits')
    expect(result.names).not.toContain('MediaFlow')
    expect(result.names).not.toContain('MediaHub')
    expect(result.names).not.toContain('ProgressPulse')
  }
})
it('does not send unreviewed candidates to availability if the critic returns malformed data', async () => {
  complete.mockImplementation(async (request) => {
    const input = JSON.parse(request.user)
    return reply(
      input.stage === 'analyze'
        ? analysis
        : { names: ['Shelfmark', 'After the Credits'] },
    )
  })
  expect(
    (await generateNames('Website', 'media tracking', undefined)).status,
  ).toBe('unavailable')
})
it('interprets compact keep decisions and resolves explicit candidate IDs correctly', async () => {
  complete.mockImplementation(async (request) => {
    const input = JSON.parse(request.user)
    if (input.stage === 'analyze') return reply(analysis)
    if (input.stage === 'explore')
      return reply({
        names: ['Shelfmark', 'After the Credits', 'Paper Lantern'],
      })
    expect(input.candidates).toEqual([
      { id: 0, name: 'Shelfmark' },
      { id: 1, name: 'After the Credits' },
      { id: 2, name: 'Paper Lantern' },
    ])
    return reply({
      reviews: [
        [1, [9, 9, 9, 9, 9, 9, 9, 9, 9], 2, true],
        [0, [9, 9, 9, 9, 9, 9, 9, 9, 9], 1, false],
      ],
    })
  })
  expect(await generateNames('Website', 'media tracker', undefined)).toEqual({
    status: 'ready',
    names: ['After the Credits'],
  })
})
it('retries the failed stage without discarding an existing analysis', async () => {
  vi.useFakeTimers()
  let explorations = 0
  complete.mockImplementation(async (request) => {
    const input = JSON.parse(request.user)
    if (input.stage === 'analyze') return reply(analysis)
    if (input.stage === 'explore') {
      if (explorations++ === 0)
        throw new LLMUnavailableError('rate_limited', 'busy')
      return reply({ names: ['After the Credits', 'Shelfmark'] })
    }
    return reply({
      reviews: [
        {
          id: 0,
          scores: [9, 9, 9, 9, 9, 9, 9, 9, 9],
          territory: 'story',
          issue: '',
        },
      ],
    })
  })
  try {
    const resultPromise = generateNames('Website', 'media tracker', undefined)
    await vi.runAllTimersAsync()
    expect((await resultPromise).status).toBe('ready')
    expect(
      complete.mock.calls.filter(
        ([request]) => JSON.parse(request.user).stage === 'analyze',
      ),
    ).toHaveLength(1)
  } finally {
    vi.useRealTimers()
  }
})
it('reviews the screened pool rather than spending critique on occupied names', async () => {
  const prepareCandidates = vi.fn(async () => ['Ticket Orchard'])
  complete.mockImplementation(async request => {
    const input = JSON.parse(request.user)
    if(input.stage === 'analyze') return reply(analysis)
    if(input.stage === 'explore') return reply({names:['Shelfmark','Ticket Orchard']})
    expect(input.names).toEqual(['Ticket Orchard'])
    return reply({reviews:[[0,Array(9).fill(9),0,true]]})
  })
  await generateNames('Website','media tracker',undefined,{prepareCandidates} as Parameters<typeof generateNames>[3])
  expect(prepareCandidates).toHaveBeenCalled()
})
it('screens four domain-ready editorial survivors before spending on optional refinement', async () => {
  const good = ['Shelfmark','After the Credits','Ticket Drawer','Second Sitting']
  complete.mockImplementation(async request => {
    const input = JSON.parse(request.user)
    if(input.stage==='analyze') return reply(analysis)
    if(input.stage==='explore') return reply({names:[...good,...Array.from({length:16},(_,i)=>`Paper ${String.fromCharCode(97+i)}garden`)]})
    if(input.stage==='refine') return reply({names:[]})
    return reply({reviews:input.names.map((name:string,id:number)=>({id,scores:Array(9).fill(9),territory:name,issue:''}))})
  })
  const result=await generateNames('Website','media tracker',undefined,{prepareCandidates:async()=>good})
  expect(result).toEqual({status:'ready',names:good})
  expect(complete.mock.calls.some(([request])=>JSON.parse(request.user).stage==='refine')).toBe(false)
})
