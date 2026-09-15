import { expect, it } from 'vitest'
import { parseEnv } from 'node:util'
import { readFileSync, writeFileSync } from 'node:fs'
import { generateNames, type NamingTrace } from './namegen'

it.skipIf(process.env.NAMING_IMPROVEMENTS_LIVE !== '1')('samples naming variety and generation latency with the configured provider', async () => {
  Object.assign(process.env, parseEnv(readFileSync('.env.local', 'utf8')))
  const samples = []
  for (const brief of ['A mobile app for film fans to track movies and remember the people behind them', 'A friendly neighbourhood bakery selling fresh bread each morning']) {
    const traces: NamingTrace[] = []
    const started = Date.now()
    const result = await generateNames('Brand or product', brief, undefined, { signal: AbortSignal.timeout(100_000), onTrace: trace => traces.push(trace) })
    samples.push({ brief, elapsedMs: Date.now() - started, result, traces })
    writeFileSync('artifacts/naming-improvements-samples.json', JSON.stringify(samples, null, 2))
    console.log(JSON.stringify({ brief, elapsedMs: Date.now() - started, result }))
    expect(result.status).toBe('ready')
    if (result.status === 'ready') expect(result.names.length).toBeGreaterThanOrEqual(4)
  }
}, 210_000)

