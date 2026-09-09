# NameVetta — Architecture

## What this product claims

NameVetta researches **digital availability**: domains, code namespaces, app stores, social handles, and open-web/business presence. It reports a **Digital Viability Score** alongside a separate **Research Coverage** figure.

It does **not** perform trademark or legal clearance. That is stated on the homepage, on every report, and in the footer, and is enforced by a test (`src/lib/wording.test.ts`).

## The honesty principle

> Never claim more certainty than the source provides.

This is not a slogan here; it is encoded in three places so it cannot erode:

1. **Schema invariants** (`src/lib/core/types.ts`) — a result marked `unable_to_verify` cannot carry matches, a failure must explain itself, confidence 0 is incompatible with a verified status, and a `confirmed_conflict` needs evidence behind it. Adapter output is validated at the orchestrator boundary, so a buggy adapter is discarded rather than rendered as fact.
2. **Scoring** — unverifiable sources are excluded from the score (`null`), never counted as `0` or as clean. The gap surfaces as reduced coverage instead.
3. **Presentation** (`src/lib/presentation.ts`) — unverified states render grey with a `?`, never green and never amber. Amber reads as "minor problem"; the truth is "no information".

## Source model

Every source implements one interface and returns one shape:

```
SourceAdapter.run(ctx, deps) -> SourceResult
```

`SourceResult.status` is one of five values. There is deliberately **no `available`** — availability is a claim we are rarely entitled to make.

| Status | Meaning |
|---|---|
| `no_conflict` | Search completed, nothing meaningful found |
| `similar_found` | Needs investigation |
| `confirmed_conflict` | Exact or very strong conflict |
| `unable_to_verify` | Source failed, unsupported, or quota exhausted |
| `manual_check_recommended` | Automatic evidence is not reliable enough |

The manifest (`src/lib/core/adapter.ts`) declares per source: which scan types run it, its timeout, cache TTL, base confidence ceiling, ToS posture, and whether it is metered. `tosPosture: 'scrape'` exists in the type only so the prohibition is explicit — a manifest entry declaring it fails a test. **Nothing in this product scrapes.**

## Source policy

Every source declares how it may be used, and the product holds itself to it.

| Source | Cost | Limit posture | Notes |
|---|---|---|---|
| Domain (RDAP + DNS) | Free | Open protocol, courtesy ceiling | Per-registry servers; conservative shared limit |
| GitHub | Free | 5,000/hr authenticated, 60/hr without | Token strongly recommended |
| npm | Free | No published limit; courtesy ceiling | |
| PyPI | Free | Considerate-use request; courtesy ceiling | No search API — exact + variant probes only |
| crates.io | Free | ~1 req/sec crawler policy, documented | Requires an identifying User-Agent, sent on every outbound request by default |
| RubyGems | Free | No published limit; courtesy ceiling | |
| NuGet | Free | No published limit; courtesy ceiling | Exact check and search both go through the search service — `packageid:` is an exact filter within it |
| Docker Hub | Free | No published limit; courtesy ceiling | Namespaced, not flat — only the curated `library` namespace produces an exact match; a same-named repo under an individual account scores as similar |
| Homebrew | Free | No published limit; courtesy ceiling | No search API (full index is ~18 MB) — exact + variant probes only. Served from GitHub Pages, whose 404 is HTML, not JSON — handled explicitly rather than assumed |
| App Store (iTunes Search) | Free | **~20 requests/minute, documented** | Rate-limited, not unmetered. Limiter + cache |
| Flathub | Free | No published limit; fetched at most once/day per process | No query API — the ~90 KB app-id list (~3,300 apps) is fetched and searched locally, same shape as EDGAR. Display name is inferred from the id's final segment, since Flathub publishes no name field |
| Wikidata | Zero-dollar | **Fair-use limited**, no published ceiling | Identified UA, self-imposed limit, 429 backoff |
| SEC EDGAR | Free | Fair-access policy; identifying UA **required** | SEC registrants only — not a US-company database |
| YouTube | Free tier | 10,000 quota units/day; search.list costs 100 | Exact handle lookup; no search.list spend |
| Companies House | Free w/ key | 600 requests / 5 minutes | `advanced-search` — exact containment, and the only declared industry signal (SIC) |
| Tavily (web, Play discovery) | 1,000 credits/month free, **no card** | Metered, budget-guarded | One request per Deep Check; second only where an app store matters |
| Socials (Instagram, TikTok, Reddit, Twitch, Threads) | n/a | **Manual only** | No unauthenticated profile fetching, ever |
| Slack | n/a | **Manual only** | `{name}.slack.com` answers 403 with a browser-not-supported page for every workspace that exists — a block, not a verdict. Downgraded from automatic after measurement |

### Why six platforms remain manual

| Platform | Official API position | Why it is not an automatic NameVetta check |
|---|---|---|
| Instagram | Business Discovery requires a Meta app, a user access token, and a professional Instagram account. It covers public business and creator accounts, not arbitrary personal-handle availability. App and user quotas apply. | No credential-free arbitrary username lookup. |
| TikTok | Display API reads the user who authorized the app. Research API username queries require approved research access and a client token. Provider quotas apply. | Neither product is an open arbitrary-handle availability API. |
| Reddit Community | Reddit requires explicit Data API approval. Commercial use also requires written approval. OAuth and approved access limits apply. | The product checks the subreddit/community namespace, and does not assume API approval. |
| Twitch | Helix `Get Users` can look up a login, but requires a registered application, Client ID, secret-derived app token, and token-bucket rate limits. | The product owner explicitly chose not to add Twitch credentials. |
| Threads | The Threads API requires a Meta application and access token. It does not provide a credential-free arbitrary-handle availability endpoint. App and user quotas apply. | No new developer app or credential is being introduced. |
| Slack | `team.info` requires a scoped token. Domain lookup is limited to teams in the same Enterprise as that token. It is Tier 3 rate limited. | It cannot answer whether an arbitrary public workspace subdomain is claimed. |

Manual does not mean ignored. Quick Check supplies the exact platform links. Deep Research also
classifies relevant profile URLs already returned by its one web search and shows them as possible
public matches. This costs no additional search credit. Discovery evidence never becomes a verified
result, never becomes `no_conflict`, and does not affect score or coverage.

Product Hunt and last.fm are legacy source IDs. Their adapters and active manifest membership were
removed after production reliability review. The IDs and labels remain schema-readable so historical
reports can still be parsed, but they do not run, appear in source tables, affect scoring, health, or
active source counts.

### Counting sources honestly

Several source counts, and none mean the same thing. `sourceCounts()` in
`src/lib/core/adapter.ts` is the only place any of them is computed, and every
page that prints one imports it:

| | What it is |
|---|---|
| **Catalog** | Every entry in `SOURCE_MANIFEST` |
| **Quick Check** | Sources whose `runsOn` includes `quick` |
| **Deep Research** | Sources whose `runsOn` includes `deep` — the whole catalog |
| **Discovery** | `resultMode: 'discovery'`; surfaces public leads without an availability verdict |
| **Manual** | `tosPosture: 'manual_only'`; never asserted automatically |
| **Category-dependent** | `CATEGORY_DEPENDENT_SOURCES`; runs only where the surface is relevant |

The site used to say "60 sources checked on every search" in three places. It
was false in both directions: some sources run only on Deep Research, some run
only where their category makes them useful, and some never run automatically.
`src/lib/consistency.test.ts` now fails the build on a hard-coded count or on
that phrase.

### The rate-limit invariant

A rate-limited, blocked or unavailable source **can never be reported as clear**.
It returns `unable_to_verify` with a `RATE_LIMITED` code, scores 0 confidence, is
excluded from the Digital Viability Score, and drops research coverage. The
distinction is the whole point: *we learned nothing* is not the same as *nothing
was found*.

Three mechanisms enforce it:

1. **Manifest metadata** — each source declares `rateLimit.requestsPerMinute`,
   whether the provider documents that number, and a note explaining it.
2. **Shared limiter + cache** (`src/lib/sources/rate-limit.ts`) — a token bucket
   per source, checked *after* the response cache so a cache hit never spends a
   token. When the bucket is empty the call is refused locally rather than fired
   at the provider.
3. **Health tracking** (`src/lib/sources/health.ts`) — outcomes feed
   `healthMultiplier`, so a source that keeps being throttled loses confidence on
   the calls that do succeed. Rate limiting counts as a failure, not a neutral event.

Upstream `429`s honour `Retry-After` when it is short enough to be worth waiting
for, and otherwise surface as `RATE_LIMITED` rather than a generic HTTP error, so
throttling and breakage stay distinguishable in logs and in health.

## Orchestration

```
POST /api/scan  ──► runScan(ctx)  ──► NDJSON stream of ScanEvent
                      │
                      ├── all sources start concurrently
                      ├── each under its own timeout (AbortController)
                      ├── every failure mode → well-formed unable_to_verify
                      └── results yielded as they settle (progressive UI)
```

**No single source can break a scan.** A timeout, a throw, a malformed response, a missing credential — all become `unable_to_verify`. The scan always completes.

Phase 4 replaces the NDJSON transport with a database-backed job plus Supabase Realtime (which additionally survives a closed tab). The `ScanEvent` shape does not change, so the client is unaffected.

## Scoring

**Digital Viability Score** — `Σ(weight_group × subscore_group) / Σ(weight_group)` over groups that actually answered, then capped. Inside a source, the strongest match carries its full penalty and additional independent matches add diminishing penalties. Duplicate matches are counted once. Inside a group, the confidence-weighted average is bounded by its strongest reliable risk signal, so many clear package registries cannot hide one strong package collision.

Weights are per category (`src/lib/scoring/weights.ts`) and must sum to 100 — enforced by test. Renormalising over answered groups means a Quick Check is not punished for running fewer sources; the gap is reported through coverage.

**There is no trademark group.** V1 gathers no automated trademark evidence, so a trademark weight would imply a measurement never taken.

**Research Coverage** — the same weights applied to what completed. A source that returned `unable_to_verify` contributes 0.

**Confidence** — `base_ceiling × health × freshness`. Official first-party APIs ceiling at 95; web-derived inference at 50; manual-only at 30.

**Caps** (§20) — an exact, major, same-industry business found through web research caps the score at 40. Any other confirmed exact collision also caps the score, with the ceiling derived from the severity and number of findings rather than one fixed number. Trademark caps are absent because a cap fired from evidence we never gathered would be fabricated.

## AI explanation layer

A second, deliberately separate step after a Deep Check's `complete` event, never inside `runScan` itself — the score and evidence must exist and be correct with the AI provider dead, unconfigured, or out of budget, and keeping the call out of the orchestrator is what makes that true by construction rather than by discipline.

```
complete event ──► buildDigest(ctx, summary) ──► Groq (LLMProvider) ──► checkGrounding
                       │                                                    │
                       │                                          pass ─────┤──► ai_summary event { ready }
                       │                                          fail ─► retry once ─► fail again ─► { unavailable }
                       └── token-budgeted, and the closed world of
                           facts (`Facts`) the answer is checked against
```

**`buildDigest`** (`src/lib/ai/digest.ts`) compacts a `ScanSummary` to fit a hard token ceiling, dropping the least severe findings first, and simultaneously builds `Facts` — every name, number and source label the model is allowed to mention. This is the same data serialised two ways: one copy is the prompt, the other is the allow-list the answer is checked against.

**`checkGrounding`** (`src/lib/ai/grounding.ts`) rejects a forbidden legal-conclusion phrase, a number absent from `Facts`, or an entity absent from it — checked both as an exact phrase and, for a multi-word phrase, as a set of individually-known words, so a reordering of a real label ("UK Companies House" for "Companies House (UK)") passes while a genuinely invented name does not. A summary that fails twice (one retry, with the mistake named to the model) is dropped, never shown edited.

**Groq** (`src/lib/providers/groq.ts`) is the `LLMProvider` implementation, on `openai/gpt-oss-120b` with `reasoning_effort: 'low'` — a reasoning model given a low effort budget still spends part of its token allowance thinking before it writes, and the default effort was observed, against the live API, to occasionally spend the whole allowance that way and return nothing. Requests are serialised through an in-process queue against Groq's measured 8,000-tokens/minute ceiling (not the 30 RPM/6k TPM the free-tier docs implied), and a monthly `provider_budget` row stops it well short of the real 1,000-requests/day limit.

Only a Deep Check requests one — a five-source Quick Check carries too little evidence to explain, and the explanation must never delay the score arriving.

## Trademark: the module boundary

V1 performs **no automated trademark research**. No corpus, no bulk ingestion, no TSDR, no EUIPO API, no WIPO querying, nothing scraped, no paid API, no production approval needed.

What ships is **Trademark Assist** (`src/lib/trademark/`): entirely local computation that prepares the user to search the official free registries themselves.

```
src/lib/trademark/
├─ provider.ts   TrademarkProvider seam + screening state machine
├─ assist.ts     variant generation, official destinations, guided brief
└─ classes.ts    Nice class + goods/services suggestions
```

### The extension point

`TrademarkProvider` is the documented seam for automated jurisdictions. `TRADEMARK_PROVIDERS` is intentionally empty; adding USPTO, EUIPO or any national office later means implementing one interface and registering it — **no restructuring of scoring, scanning, or the report**. A test asserts the array is empty in V1 so that stays a deliberate state rather than drift.

`TrademarkImportParser` is the parallel seam for user-supplied registry exports. Also empty: the format must be documented and reliable before we parse it, and **V1 does not depend on this feature**.

### Screening state

`not_started` → `in_progress` → `completed`, plus `unable_to_verify`. Rolled up conservatively: `completed` only when *every* offered jurisdiction is completed. Partial progress is never done.

**No screening state is ever tone `ok`.** Even a completed screening with nothing found renders `neutral`, because the user performed a preliminary search, not a clearance.

### Score separation

The Digital Viability Score is digital-only and never absorbs trademark findings. A completed screening produces its own separate concern level (`unknown`/`low`/`medium`/`high`/`critical`) displayed beside it. An incomplete screening always yields `unknown` — there is no state in which unfinished trademark work reads as reassuring.

## Wording rules

`FORBIDDEN_PHRASES` in `src/lib/presentation.ts` lists phrases that assert legal conclusions this product cannot reach: *legally safe*, *trademark cleared*, *guaranteed available*, *safe to register*, and others. `wording.test.ts` scans non-test source for them, so the rule is enforced rather than documented — a well-meaning copy edit cannot reintroduce them. The same test forbids describing a name as simply "available".

## Stack

Next.js 16 (App Router) · React 19 · TypeScript strict + `noUncheckedIndexedAccess` · Tailwind v4 · Zod at every boundary · Vitest.

**Design system:** Outfit via `next/font`, doing display and body both — one
family, one download. `#635BFF` accent, sampled from `logo.png` where it
accounts for 170,737 pixels against 564 for the next value, and identical in
every context rather than lightened anywhere.

### The theme contract

**System appearance by default, with an explicit choice that outranks it.**
Stated here because it is the kind of thing three parts of a codebase can
disagree about silently:

- **No stored choice** — no `data-theme` attribute is written at all, and
  `color-scheme: light dark` lets the CSS follow `prefers-color-scheme` with no
  JavaScript involved.
- **A choice made** — `ThemeToggle` writes `nv-theme` to `localStorage` and
  stamps `data-theme` on `<html>`; the pre-paint script in `layout.tsx` re-applies
  it before the first frame, from the same key.
- **`theme-color`** — one tag, rewritten in place by both the bootstrap and the
  toggle, so mobile browser chrome always matches what is on screen rather than
  what the OS asked for.
- **Hydration** — `getServerSnapshot` returns `null` and renders a placeholder,
  because which theme is active is not knowable on the server.

`e2e/pages.spec.ts` asserts all four. The one exception to the whole model is
the print block in `globals.css`, which is not a theme — paper is white whatever
the screen does.

Surfaces are hard-edged: a 2px border and no drop shadow anywhere, no
background pattern. The weight of the line is the whole effect.

Live: Supabase (Postgres/Auth/RLS), Vercel Hobby, Sentry, Cloudflare
Turnstile.

## Cost posture

**$0/month to operate.** No paid APIs, no paid database plans, no Redis, no subscriptions.

Quality is never traded away to hit that. Where something cannot be reliably and legitimately automated for free, the answer is a transparent guided workflow — Trademark Assist is exactly that pattern — never scraping, guessing, or reporting false availability.
