import { expect, it } from 'vitest'
import { appendFileSync, writeFileSync } from 'node:fs'
import { generateShortlist } from './shortlist'
it.skipIf(process.env.NAMING_LIVE_CHECK !== '1')('checks a complete four-name shortlist with real providers', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (...args) => {
    const response = await originalFetch(...args)
    if (String(args[0]).includes('api.groq.com') || String(args[0]).includes('generativelanguage.googleapis.com') || String(args[0]).includes('/rpc/consume_provider_budget')) {
      appendFileSync('artifacts/shortlist-provider-responses.jsonl', JSON.stringify({ status: response.status, body: await response.clone().json() }) + '\n')
    }
    return response
  }
  try {
  const result = await generateShortlist({ category: 'saas', description: 'A document viewer and converter that works completely offline. For freelancers and small offices who want to open, organize and convert their files without uploading private documents. Calm, trustworthy, easy to say and memorable. Avoid invented tech suffixes.' , onProgress: (progress) => console.log('Naming progress', progress) })
  writeFileSync('artifacts/naming-live-result.json', JSON.stringify(result, null, 2))
  console.log('Naming result', JSON.stringify(result))
  expect(result.status).toBe('ready')
  if (result.status === 'ready') expect(result.ranked.candidates).toHaveLength(4)
  } finally { globalThis.fetch = originalFetch }
}, 280_000)
