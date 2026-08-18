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
| App Store (iTunes Search) | Free | **~20 requests/minute, documented** | Rate-limited, not unmetered. Limiter + cache |
| Wikidata | Zero-dollar | **Fair-use limited**, no published ceiling | Identified UA, self-imposed limit, 429 backoff |
| SEC EDGAR | Free | Fair-access policy; identifying UA **required** | SEC registrants only — not a US-company database |
| YouTube | Free tier | 10,000 quota units/day; search.list costs 100 | Exact handle lookup; no search.list spend |
| Companies House | Free w/ key | 600 requests / 5 minutes | `advanced-search` — exact containment, and the only declared industry signal (SIC) |
| Tavily (web, Play discovery) | 1,000 credits/month free, **no card** | Metered, budget-guarded | One request per Deep Check; second only where an app store matters |
| Socials | n/a | **Manual only** | No unauthenticated profile fetching, ever |

**Product Hunt is deliberately not implemented.** It is not a core source unless and
until we have permission for our intended public-product use, so it does not appear
in `SOURCE_IDS` at all rather than sitting in the manifest looking available.

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

**Digital Viability Score** — `Σ(weight_group × subscore_group) / Σ(weight_group)` over groups that actually answered, then capped.

Weights are per category (`src/lib/scoring/weights.ts`) and must sum to 100 — enforced by test. Renormalising over answered groups means a Quick Check is not punished for running fewer sources; the gap is reported through coverage.

**There is no trademark group.** V1 gathers no automated trademark evidence, so a trademark weight would imply a measurement never taken.

**Research Coverage** — the same weights applied to what completed. A source that returned `unable_to_verify` contributes 0.

**Confidence** — `base_ceiling × health × freshness`. Official first-party APIs ceiling at 95; web-derived inference at 50; manual-only at 30.

**Caps** (§20) — one survives in V1: an exact, major, same-industry business found through web research caps the score at 40. The two trademark caps are gone from the automatic path, because a cap fired from evidence we never gathered would be fabricated.

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

**Design system:** Fraunces (display), Inter (sans), JetBrains Mono (mono) via `next/font`. Charcoal `#141C2E` on a warm `#FAFAF8` canvas, teal `#0F766E` accent. Committed to a single light palette — the design is built around a paper canvas with a grid, and a dark inversion would be a different design rather than the same one recoloured.

Planned: Supabase (Postgres/Auth/Realtime/RLS), Vercel Hobby, Sentry, Cloudflare Turnstile.

## Cost posture

**$0/month to operate.** No paid APIs, no paid database plans, no Redis, no subscriptions.

Quality is never traded away to hit that. Where something cannot be reliably and legitimately automated for free, the answer is a transparent guided workflow — Trademark Assist is exactly that pattern — never scraping, guessing, or reporting false availability.
