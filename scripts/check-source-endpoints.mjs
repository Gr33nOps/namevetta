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

/* -------------------------------------------------------------------------- */
/* The probes a production audit caught answering the wrong question          */
/* -------------------------------------------------------------------------- */

/**
 * A name nobody has registered anywhere, checked alongside one that exists.
 *
 * Every source below was verified once against a name that is taken and never
 * against a name that is free, and every one of them was wrong in production
 * because of it. metacpan answers 200 with an application shell for a module
 * nobody has published, so CPAN reported a confirmed conflict on every name it
 * ever saw — and a taken-name check passes that adapter perfectly.
 *
 * Long and unpronounceable on purpose: a short placeholder is exactly the kind
 * of string somebody has already registered somewhere.
 */
const NONSENSE = 'zzqqxwvblorptu9174'

async function statusOf(url, method = 'GET') {
  const response = await fetch(url, { method, headers: { 'user-agent': UA } })
  return response.status
}

/** Elasticsearch reports `hits.total` as a bare number on some deployments. */
function totalOf(hits) {
  const total = hits?.total
  return typeof total === 'object' ? total?.value : total
}

await check('MetaCPAN API (cpan adapter)', async () => {
  // The case-folded field: `normalize()` lowercases before the adapter sees a
  // name, and `distribution` itself is case-sensitive upstream. Probing the
  // case-sensitive route would report every name as free — the same systematic
  // lie as before, in the opposite direction.
  const takenQuery = encodeURIComponent('distribution.lowercase:"moose"')
  const taken = await getJson(
    `https://fastapi.metacpan.org/v1/release/_search?q=${takenQuery}&size=1`,
  )
  assert(taken.status === 200, `taken lookup status is 200 (got ${taken.status})`)
  assert(typeof totalOf(taken.data?.hits) === 'number', 'hits.total is a number')
  assert(totalOf(taken.data?.hits) > 0, 'a published distribution is found')
  assert(
    typeof taken.data?.hits?.hits?.[0]?._source?.distribution === 'string',
    'the real spelling comes back for the evidence line',
  )

  const freeQuery = encodeURIComponent(`distribution.lowercase:"${NONSENSE}"`)
  const free = await getJson(
    `https://fastapi.metacpan.org/v1/release/_search?q=${freeQuery}&size=1`,
  )
  assert(totalOf(free.data?.hits) === 0, 'an unpublished distribution reports zero, not a match')
})

await check('Maven Central via Sonatype (maven_central adapter)', async () => {
  // `search.maven.org` serves the same Solr endpoint and timed out on a third
  // of sampled requests; this host answered every one.
  const taken = await getJson(
    'https://central.sonatype.com/solrsearch/select?q=a:guava&rows=1&wt=json',
  )
  assert(taken.status === 200, `taken lookup status is 200 (got ${taken.status})`)
  assert(typeof taken.data?.response?.numFound === 'number', 'response.numFound is a number')
  assert(taken.data?.response?.numFound > 0, 'a published artifact is found')

  const free = await getJson(
    `https://central.sonatype.com/solrsearch/select?q=a:${NONSENSE}&rows=1&wt=json`,
  )
  assert(free.data?.response?.numFound === 0, 'an unused artifact id reports zero')
})

await check('Bitbucket workspaces API (bitbucket adapter)', async () => {
  const taken = await getJson('https://api.bitbucket.org/2.0/workspaces/atlassian')
  assert(taken.status === 200, `an existing workspace is 200 (got ${taken.status})`)
  assert(typeof taken.data?.slug === 'string', 'slug is a string')

  const free = await getJson(`https://api.bitbucket.org/2.0/workspaces/${NONSENSE}`)
  assert(free.status === 404, `a free slug is 404 (got ${free.status})`)
  // A 403 means the workspace exists but is dormant, and the adapter reads the
  // body to tell that apart from a refusal aimed at us. This pins the wording.
  assert(
    /no workspace with identifier/i.test(free.data?.error?.message ?? ''),
    'the 404 carries the registry own wording',
  )
})

await check('Hackage (hackage adapter)', async () => {
  const taken = await getJson('https://hackage.haskell.org/package/aeson')
  assert(taken.status === 200, `a published package is 200 (got ${taken.status})`)
  const free = await statusOf(`https://hackage.haskell.org/package/${NONSENSE}`)
  assert(free === 404, `an unpublished package is 404 (got ${free})`)
})

await check('Slack is no longer probed automatically', async () => {
  // Recorded as a check so the reasoning is not lost: every workspace that
  // exists answers 403 with a browser-not-supported page, which is a block and
  // not a verdict. If that ever stops being true this fails, and the decision
  // to make Slack manual can be revisited on evidence rather than on a hunch.
  const status = await statusOf('https://vercel.slack.com')
  assert(
    status === 403 || status === 429,
    `an existing workspace still refuses an automated client (got ${status})`,
  )
})

await check('AUR RPC (aur adapter)', async () => {
  const taken = await getJson('https://aur.archlinux.org/rpc/v5/info/yay')
  assert(taken.status === 200, `taken lookup status is 200 (got ${taken.status})`)
  assert(taken.data?.resultcount === 1, 'a known AUR package reports one result')
  assert(taken.data?.results?.[0]?.Name === 'yay', 'the returned package name is readable')

  const free = await getJson(`https://aur.archlinux.org/rpc/v5/info/${NONSENSE}`)
  assert(free.data?.resultcount === 0, 'an unused package name reports zero results')
})

await check('Roblox usernames API (roblox adapter)', async () => {
  const lookup = (name) =>
    getJson('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ usernames: [name], excludeBannedUsers: false }),
    })

  const taken = await lookup('Roblox')
  assert(taken.status === 200, `taken lookup status is 200 (got ${taken.status})`)
  assert(taken.data?.data?.[0]?.name === 'Roblox', 'a known username returns its account')

  const free = await lookup(NONSENSE)
  assert(Array.isArray(free.data?.data) && free.data.data.length === 0, 'an unused username returns no accounts')
})

await check('Modrinth project search (modrinth discovery)', async () => {
  const { status, data } = await getJson('https://api.modrinth.com/v2/search?query=sodium&limit=1')
  assert(status === 200, `status is 200 (got ${status})`)
  assert(Array.isArray(data?.hits), 'hits is an array')
  assert(typeof data?.hits?.[0]?.title === 'string', 'a result has a readable title')
  assert(typeof data?.hits?.[0]?.project_type === 'string', 'a result has a project type')
})

await check('Hugging Face model search (huggingface discovery)', async () => {
  const { status, data } = await getJson('https://huggingface.co/api/models?search=bert&limit=1')
  assert(status === 200, `status is 200 (got ${status})`)
  assert(Array.isArray(data), 'response is an array')
  assert(typeof data?.[0]?.id === 'string', 'a result has a repository id')
})

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`)
process.exit(failures === 0 ? 0 : 1)
