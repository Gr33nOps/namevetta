#!/usr/bin/env node
/**
 * Live shape check for a handful of upstream APIs this product depends on.
 *
 * The unit test suite runs entirely against mocked responses — correctly,
 * since a suite that hit real APIs would be slow and flaky. But that means a
 * provider changing its response shape shows up as `unable_to_verify` in
 * production, or worse, as a silently wrong answer, long before anyone
 * notices. This script is the other half: it hits each real endpoint once,
 * with a query chosen to produce a known, checkable answer, and asserts the
 * fields the adapters actually read are still there and still the expected
 * type.
 *
 * Deliberately not part of the PR-blocking `ci.yml` — a live check is
 * inherently flakier than the mocked suite, and a transient upstream blip
 * must never block a merge that has nothing to do with it. It runs on its
 * own schedule instead (see `.github/workflows/source-health-check.yml`) and
 * only ever reports, never gates.
 */

const UA = 'NameVetta-SourceHealthCheck/1 (+https://github.com/) node-script'

let failures = 0

function assert(condition, message) {
  if (!condition) {
    failures++
    console.error(`  FAIL  ${message}`)
  } else {
    console.log(`  ok    ${message}`)
  }
}

async function getJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { 'user-agent': UA, accept: 'application/json', ...(init.headers ?? {}) },
  })
  const text = await response.text()
  let data
  try {
    data = text.trim() === '' ? undefined : JSON.parse(text)
  } catch {
    data = undefined
  }
  return { status: response.status, data }
}

async function check(name, fn) {
  console.log(`\n${name}`)
  try {
    await fn()
  } catch (cause) {
    failures++
    console.error(`  FAIL  threw: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
}

await check('IANA RDAP bootstrap (domain adapter)', async () => {
  const { status, data } = await getJson('https://data.iana.org/rdap/dns.json')
  assert(status === 200, `status is 200 (got ${status})`)
  assert(Array.isArray(data?.services), 'services is an array')
  assert((data?.services?.length ?? 0) > 50, 'services has a plausible number of entries')
})

await check('npm registry + downloads API', async () => {
  const doc = await getJson('https://registry.npmjs.org/react')
  assert(doc.status === 200, `package doc status is 200 (got ${doc.status})`)
  assert(typeof doc.data?.name === 'string', 'doc.name is a string')
  assert(typeof doc.data?.time?.modified === 'string', 'doc.time.modified is a string')

  const dl = await getJson('https://api.npmjs.org/downloads/point/last-month/react')
  assert(dl.status === 200, `downloads status is 200 (got ${dl.status})`)
  assert(typeof dl.data?.downloads === 'number', 'downloads.downloads is a number')
})

await check('GitHub users API', async () => {
  const { status, data } = await getJson('https://api.github.com/users/github')
  assert(status === 200, `status is 200 (got ${status})`)
  assert(typeof data?.login === 'string', 'login is a string')
  assert(typeof data?.public_repos === 'number', 'public_repos is a number')
  assert(typeof data?.followers === 'number', 'followers is a number')
})

await check('Bluesky AT Protocol public API', async () => {
  const notFound = await getJson(
    'https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=this-should-not-exist-zzz-xyz-99999.bsky.social',
  )
  assert(notFound.status === 400, `unclaimed handle status is 400 (got ${notFound.status})`)
  assert(notFound.data?.error === 'InvalidRequest', 'unclaimed handle reports InvalidRequest')

  const found = await getJson(
    'https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=bsky.app',
  )
  assert(found.status === 200, `claimed handle status is 200 (got ${found.status})`)
  assert(typeof found.data?.did === 'string', 'claimed handle returns a did')
})

await check('Nominatim (OpenStreetMap)', async () => {
  const { status, data } = await getJson(
    'https://nominatim.openstreetmap.org/search?q=Dishoom&format=jsonv2&limit=3',
  )
  assert(status === 200, `status is 200 (got ${status})`)
  assert(Array.isArray(data), 'response is an array')
  assert(data?.length > 0, 'a well-known query returns at least one result')
  assert(typeof data?.[0]?.category === 'string', 'result[0].category is a string')
  assert(typeof data?.[0]?.lat === 'string', 'result[0].lat is a string')
})

await check('French company register (api.gouv.fr)', async () => {
  const { status, data } = await getJson(
    'https://recherche-entreprises.api.gouv.fr/search?q=Doctolib&per_page=2',
  )
  assert(status === 200, `status is 200 (got ${status})`)
  assert(Array.isArray(data?.results), 'results is an array')
  assert(data?.results?.length > 0, 'a well-known query returns at least one result')
  assert(typeof data?.results?.[0]?.siren === 'string', 'result[0].siren is a string')
})

await check('GLEIF LEI register', async () => {
  const { status, data } = await getJson(
    'https://api.gleif.org/api/v1/lei-records?filter%5Bentity.legalName%5D=Monzo+Bank&page%5Bsize%5D=5',
  )
  assert(status === 200, `status is 200 (got ${status})`)
  assert(Array.isArray(data?.data), 'data is an array')
  assert(data?.data?.length > 0, 'a well-known query returns at least one result')
  assert(typeof data?.data?.[0]?.attributes?.entity?.legalName?.name === 'string', 'entity.legalName.name is a string')
  assert(typeof data?.data?.[0]?.attributes?.registration?.status === 'string', 'registration.status is a string')
})

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`)
process.exit(failures === 0 ? 0 : 1)
