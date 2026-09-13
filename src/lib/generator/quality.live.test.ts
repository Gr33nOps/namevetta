import { expect, it } from 'vitest'
import { parseEnv } from 'node:util'
import { readFileSync, writeFileSync } from 'node:fs'
import { generateNames, type NamingTrace } from './namegen'
const briefs = [
  'media tracking website for games, movies, shows and anime',
  'offline secrets manager for developers',
  'simple birthday history website',
  'AI note taking app',
  'premium clothing brand',
  'small indie game studio',
]
for (const [index, brief] of briefs.entries()) {
  it.skipIf(process.env.NAMING_QUALITY_LIVE !== '1')(
    `live editorial quality: ${brief}`,
    async () => {
      Object.assign(process.env, parseEnv(readFileSync('.env.local', 'utf8')))
      const traces: NamingTrace[] = []
      const result = await generateNames('Brand or product', brief, undefined, {
        onTrace: (trace) => {
          traces.push(trace)
          writeFileSync(
            `artifacts/naming-quality-${index + 1}.json`,
            JSON.stringify({ brief, traces }, null, 2),
          )
        },
        signal: AbortSignal.timeout(240_000),
      })
      writeFileSync(
        `artifacts/naming-quality-${index + 1}.json`,
        JSON.stringify({ brief, result, traces }, null, 2),
      )
      console.log(brief, JSON.stringify(result))
      expect(result.status).toBe('ready')
      if (result.status === 'ready')
        expect(result.names.length).toBeGreaterThanOrEqual(4)
    },
    250_000,
  )
}
