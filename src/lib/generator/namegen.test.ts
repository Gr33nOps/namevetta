import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LLMUnavailableError } from '@/lib/providers/llm'
const complete=vi.hoisted(()=>vi.fn())
vi.mock('@/lib/providers/fallback',()=>({completeWithFallback:complete}))
import { generateNames, sanitiseCandidates, filterQuality, rankByQuality, curateNames } from './namegen'
const reply=(value:unknown)=>({text:JSON.stringify(value),model:'test',promptTokens:1,completionTokens:1})
const analysis={purpose:'Build something',audience:'People',concepts:['ritual','memory'],emotions:['delight'],vocabulary:['shelf','story'],territories:['memory','collection','journey','ritual','craft','place']}
beforeEach(()=>{complete.mockReset()})
describe('sanitiseCandidates', () => {
  it('trims, dedupes case-insensitively, and preserves first-seen casing', () => {
    expect(sanitiseCandidates(['Zolvex', 'zolvex', ' Zolvex ', 'Marbrix'], undefined)).toEqual([
      'Zolvex',
      'Marbrix',
    ])
  })

  it('drops the seed name itself, case-insensitively', () => {
    expect(sanitiseCandidates(['Envryn', 'ENVRYN', 'Envrynix'], 'envryn')).toEqual(['Envrynix'])
  })

  it('drops empty strings, whitespace-only entries and non-strings', () => {
    expect(sanitiseCandidates(['', '   ', 'Ok', 123, null], undefined)).toEqual(['Ok'])
  })

  it('drops names that fail the same CandidateNameSchema a human-typed name goes through', () => {
    expect(sanitiseCandidates(['A', 'Ok'], undefined)).toEqual(['Ok'])
  })

  it('drops names over the max length', () => {
    const tooLong = 'X'.repeat(65)
    expect(sanitiseCandidates([tooLong, 'Ok'], undefined)).toEqual(['Ok'])
  })
})

describe('filterQuality', () => {
  it('drops famous names and records why', () => {
    const { kept, dropped } = filterQuality(['Cloudari', 'Tekken', 'Google'])
    expect(kept).toContain('Cloudari')
    expect(kept).not.toContain('Tekken')
    expect(kept).not.toContain('Google')
    expect(dropped.some((d) => /tekken/i.test(d.reason))).toBe(true)
  })

  it('drops brandability failures', () => {
    const { kept } = filterQuality(['Cloudari', 'Bcdfgh', 'One Two Three Four'])
    expect(kept).toEqual(['Cloudari'])
  })

  it('keeps genuinely good names', () => {
    const { kept } = filterQuality(['Cloudari', 'Marketrove', 'Nordvel'])
    expect(kept).toEqual(['Cloudari', 'Marketrove', 'Nordvel'])
  })
})

describe('rankByQuality', () => {
  it('orders stronger brand names ahead of weaker ones', () => {
    const ranked = rankByQuality(['DataifyAI', 'Cloudari', 'QuantumSphereHub'])
    expect(ranked[0]).toBe('Cloudari')
  })

  it('is a stable sort for equal scores', () => {
    const names = ['Lumira', 'Zephyra']
    // Both clean; ties fall back to original order.
    const ranked = rankByQuality(names)
    expect(new Set(ranked)).toEqual(new Set(names))
  })
})


function healthy(batches:string[][]) {
  let index=0
  complete.mockImplementation(async(request)=>{
    const input=JSON.parse(request.user)
    if(input.stage==='analyze') return reply(analysis)
    if(input.stage==='explore') return reply({names:batches[index++]??[]})
    return reply({reviews:input.names.map((name:string,id:number)=>({id,scores:[8,8,8,8,8,8,8,8,8],territory:name,issue:''}))})
  })
}
it('combines independent explorations before editorial review, rejecting famous and repeated names',async()=>{
  healthy([['Cedar Table','Google','Bcdfgh'],['Cedar Tables','Copper Apron'],['Sunday Crumb','Orchard Oven']])
  const result=await generateNames('Bakery','a bakery',undefined,{maxAttempts:1})
  expect(result).toEqual({status:'ready',names:['Cedar Table','Copper Apron','Sunday Crumb','Orchard Oven']})
})
it('passes all already-seen names as exclusions between explorations',async()=>{
  healthy([['Cedar Table'],['Copper Apron'],['Sunday Crumb']])
  await generateNames('Bakery','a bakery',undefined)
  const requests=complete.mock.calls.map(([request])=>JSON.parse(request.user)).filter((input)=>input.stage==='explore')
  expect(requests[1].exclude).toContain('Cedar Table')
  expect(requests[2].exclude).toContain('Copper Apron')
})
it('rejects previously screened families even if the model repeats them',async()=>{
  healthy([['Cedar Table','Cedar Tables'],['Copper Apron'],['Sunday Crumb']])
  const result=await generateNames('Bakery','a bakery',undefined,{exclude:['Cedar Table']})
  expect(result).toEqual({status:'ready',names:['Copper Apron','Sunday Crumb']})
})
it('ignores injected IDs, duplicate IDs and vetoed or weak reviews',async()=>{
  complete.mockResolvedValue(reply({reviews:[
    {id:40,scores:[9,9,9,9,9,9,9,9,9],territory:'fake',issue:''},
    {id:0,scores:[9,9,9,9,9,9,9,9,9],territory:'light',issue:''},
    {id:0,scores:[9,9,9,9,9,9,9,9,9],territory:'light',issue:''},
    {id:1,scores:[9,9,9,9,9,9,9,9,9],territory:'fake',issue:'tenuous meaning'},
    {id:2,scores:[9,9,9,3,3,9,9,9,9],territory:'sound',issue:''},
  ]}))
  expect(await curateNames(['Paper Lantern','Mild Folio','Bcdfgh'],'A product')).toEqual(['Paper Lantern'])
})
it('rejects malformed or missing analysis without exposing raw names',async()=>{
  complete.mockResolvedValue(reply({names:['Paper Lantern']}))
  expect((await generateNames('Website','an idea',undefined)).status).toBe('unavailable')
})
it('keeps genuine ordinary words ending in letters used by trendy suffixes',async()=>{
  healthy([['Family Album'],['Portfolio'],['Olive Branch']])
  const result=await generateNames('Website','family birthday history',undefined)
  expect(result.status).toBe('ready')
  if(result.status==='ready') expect(result.names).toContain('Portfolio')
})
it.each(['no_api_key','budget_exhausted','rate_limited','timeout'] as const)('returns a usable error for %s',async(reason)=>{
  vi.useFakeTimers()
  complete.mockRejectedValue(new LLMUnavailableError(reason,'test'))
  const pending=generateNames('Website','an idea',undefined)
  await vi.runAllTimersAsync()
  const result=await pending
  vi.useRealTimers()
  expect(result.status).toBe('unavailable')
  if(result.status==='unavailable' && reason==='rate_limited') expect(result.retryAfterMs).toBe(61000)
})
it('does not call a provider after cancellation',async()=>{
  await generateNames('Website','an idea',undefined,{signal:AbortSignal.abort()})
  expect(complete).not.toHaveBeenCalled()
})
