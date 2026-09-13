import { expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { generateShortlist } from './shortlist'
it.skipIf(process.env.NAMING_LIVE_CHECK !== '1')(
  'returns researched names or a clearly labelled partial shortlist with real providers',
  async () => {
    Object.assign(process.env, parseEnv(readFileSync('.env.local', 'utf8')))
    const result = await generateShortlist({
      category: 'saas',
      description: 'media tracking website for games, movies, shows and anime',
      onProgress: (progress) => console.log('Naming progress', progress),
    })
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
  },
  280_000,
)
