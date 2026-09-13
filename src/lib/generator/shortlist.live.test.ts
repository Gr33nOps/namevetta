import { expect, it, vi } from 'vitest'
import * as fallback from '@/lib/providers/fallback'
import { readFileSync, writeFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { generateShortlist } from './shortlist'
it.skipIf(process.env.NAMING_LIVE_CHECK !== '1')(
  'returns researched names or a clearly labelled partial shortlist with real providers',
  async () => {
    Object.assign(process.env, parseEnv(readFileSync('.env.local', 'utf8')))
    const complete = fallback.completeWithFallback
    const trace: unknown[] = []
    const spy = vi.spyOn(fallback, 'completeWithFallback').mockImplementation(async request => {
      const started = Date.now()
      try {
        const result = await complete(request)
        trace.push({stage:JSON.parse(request.user).stage,elapsedMs:Date.now()-started,model:result.model,tokens:result.completionTokens,output:result.text})
        return result
      } catch(error) {
        trace.push({stage:JSON.parse(request.user).stage,elapsedMs:Date.now()-started,error:error instanceof Error ? error.message : String(error)})
        throw error
      } finally {
        writeFileSync('artifacts/naming-provider-trace.json',JSON.stringify(trace,null,2))
      }
    })
    const result = await generateShortlist({
      category: 'saas',
      description: 'media tracking website for games, movies, shows and anime',
      onProgress: (progress) => console.log('Naming progress', progress),
    })
    spy.mockRestore()
    writeFileSync(
      'artifacts/naming-live-result.json',
      JSON.stringify(result, null, 2),
    )
    console.log('Naming result', JSON.stringify(result))
    expect(['ready', 'partial']).toContain(result.status)
    if (result.status === 'ready')
      expect(result.ranked.candidates).toHaveLength(4)
    if (result.status === 'partial') {
      expect(result.ranked.candidates.length).toBeGreaterThan(0)
      expect(result.ranked.candidates.length).toBeLessThan(4)
      expect(result.message).toContain("couldn't complete all four")
    }
    if (result.status !== 'incomplete') {
      for (const candidate of result.ranked.candidates) {
        expect(candidate.caps).toEqual([])
        expect(candidate.score).toBeGreaterThanOrEqual(65)
        expect(candidate.coverage).toBeGreaterThanOrEqual(50)
      }
    }
  },
  280_000,
)
