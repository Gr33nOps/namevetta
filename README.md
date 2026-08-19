# NameVetta

**Research a name before you build on it.**

**Live: https://namevetta.vercel.app**

NameVetta checks how crowded a name is across domains, code namespaces, app stores,
social handles and the open web — and reports the result with evidence behind every
finding, rather than a row of green checkmarks.

It does **not** perform trademark or legal clearance. That scope limit is stated on
the homepage, on every report, and enforced by a test.

---

## The principle

> Never claim more certainty than the source provides.

There is deliberately no `available` status anywhere in the system. Availability is a
claim we are rarely entitled to make. Every check resolves to one of five states:

| Status | Meaning |
|---|---|
| `no_conflict` | Search completed, nothing meaningful found |
| `similar_found` | Needs investigation |
| `confirmed_conflict` | Exact or very strong conflict |
| `unable_to_verify` | Source failed, was rate-limited, or is unsupported |
| `manual_check_recommended` | Automatic evidence is not reliable enough |

A source that could not be checked is **excluded** from the score rather than counted
as clean. The gap surfaces as reduced *Research Coverage*, which is displayed beside
the score and never folded into it.

This is enforced in four places so it cannot erode:

1. **Zod schema invariants** — a result marked `unable_to_verify` cannot carry matches;
   a failure must explain itself; confidence 0 is incompatible with a verified status.
2. **Database CHECK constraints** — the same rules hold against anything writing
   directly to Postgres.
3. **Scoring** — unverifiable sources contribute `null`, never `0`.
4. **Presentation** — unverified states render neutral grey with a `?`, never green and
   never amber. Amber reads as "minor problem"; the truth is "no information".

## Two separate figures

**Digital Viability Score** — how usable the name is across digital surfaces, weighted
by what you are naming. A crowded npm namespace matters enormously for a developer
tool and barely at all for a restaurant.

**Research Coverage** — how much of the intended research actually completed.

They are never blended. A high score with 40% coverage means "looks fine, but we only
checked part of it", and the report says exactly that.

## Sources

| Source | Cost | Limit posture |
|---|---|---|
| Domains (RDAP + DNS fallback) | Free | Open protocol |
| GitHub | Free | 5,000/hr authenticated |
| npm | Free | Courtesy ceiling |
| PyPI | Free | No search API — exact + variant probes |
| crates.io | Free | ~1 req/sec crawler policy; identifying User-Agent required |
| RubyGems | Free | Courtesy ceiling |
| NuGet | Free | Courtesy ceiling |
| Docker Hub | Free | Courtesy ceiling; only the curated `library` namespace counts as exact |
| Homebrew | Free | No search API — exact + variant probes |
| App Store (iTunes Search) | Free | ~20 req/min, documented |
| Flathub | Free | No search API — the ~90 KB app-id list is fetched once/day and searched locally |
| Wikidata | Zero-dollar | Fair-use limited |
| SEC EDGAR | Free | Fair-access policy; identifying User-Agent required |
| Companies House (UK) | Free w/ key | 600 req/5 min; only source with a declared industry code |
| YouTube | Free tier | Quota units per call |
| Google Play | Free tier | Web-index discovery only; no official API |
| Web presence (Tavily) | 1,000 credits/mo | **No credit card required**; 1 request per Deep Check, cached 30 days |
| Local business (OpenStreetMap) | Free | ~1 req/sec usage policy; identifying User-Agent required |
| French company register | Free | Courtesy ceiling; declared NAF industry code, like Companies House's SIC |
| Global LEI register (GLEIF) | Free | Courtesy ceiling; live/lapsed registration status, no industry code |
| Bluesky | Free | Courtesy ceiling; the one social platform besides YouTube with a real handle lookup |
| Social handles (11 other platforms) | — | **Manual only** |

Nothing in this project scrapes. Where a source cannot be automated legitimately and
for free, the product uses a transparent manual workflow instead of guessing.

**F-Droid was evaluated and left out.** Its only structured endpoint is the full
repository index — about 56 MB, three times larger than the Homebrew index this
product already judged too big to fetch per scan. There is no lighter-weight search
API, so it stays out rather than being forced in.

A rate-limited or blocked source can never be reported as clear. It returns
`unable_to_verify`, scores zero confidence, and drops coverage.

## Trademark Assist

V1 performs **no automated trademark searching**. Instead it does the preparation a
founder cannot easily do alone — generating spelling, confusable and phonetic variants,
suggesting likely Nice classes with reasoning, and proposing searchable goods/services
wording — then links to the official free registries (USPTO, TMview, WIPO) with
per-registry instructions.

You perform the search; you record the outcome. Screening status is tracked separately
from the score and never reads as reassuring until genuinely complete.

`TrademarkProvider` exists as a documented extension point so automated jurisdictions
can be added later without restructuring anything.

## Similarity engine

Deterministic first, no single algorithm deciding:

- Unicode normalization, homoglyph folding, consonant skeletons
- Levenshtein, Damerau-Levenshtein, Jaro-Winkler, character n-gram cosine
- Double Metaphone phonetics, Soundex as a tie-breaker only
- A 40-node industry taxonomy, so an exact name match in an unrelated field
  ranks below a near match in the same one

## Stack

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4 · Supabase
(Postgres, Auth, RLS) · Zod at every boundary · Vitest.

Runs at **$0/month** on free tiers. Quality is never traded away to achieve that: if
something cannot be reliably automated for free, it is reported as unverified rather
than guessed.

## Getting started

```bash
npm install
cp .env.example .env.local
npm run dev
```

Every credential is optional. With none configured the app still researches names —
sources that need a key report `unable_to_verify` and coverage drops accordingly.
See [.env.example](.env.example) for what each key unlocks.

```bash
npm test          # unit and integration tests, plus the golden benchmark
npm run test:e2e  # Playwright, against a real browser
npm run typecheck # tsc --noEmit
npm run lint      # eslint
npm run build     # production build
```

`npm test` covers the engine: sources, similarity, scoring, orchestration.
`npm run test:e2e` covers what it structurally cannot, that a page renders and
hydrates in a browser: keyboard access, the mobile menu, theme persistence
across a reload, the metadata a crawler reads, and the ARIA semantics of the
comparison grid. It never calls a real source; `/api/scan` and `/api/compare`
are stubbed so the suite can't spend quota or hammer an upstream.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — source model, orchestration, scoring, source policy
- [docs/ROADMAP.md](docs/ROADMAP.md) — phase status and what is deliberately not built
- [docs/SCHEMA.md](docs/SCHEMA.md) — database schema and RLS posture
- [docs/COPY_STYLE.md](docs/COPY_STYLE.md) — the standard every piece of user-facing text is held to

## Trust and transparency

- **[/methodology](https://namevetta.vercel.app/methodology)** — the status table, score
  weights and per-source confidence ceilings, generated straight from the manifest that
  runs at request time, so this page cannot describe a rule the product doesn't enforce.
- **[/status](https://namevetta.vercel.app/status)** — real per-source success rate over
  the last 24 hours, published rather than only used internally.
- **Per-source retry.** A source that came back `unable_to_verify` for a transient reason
  (a timeout, a momentary rate limit) can be retried on its own, without spending a new
  Quick Check or Deep Check — capped per report so it can't become a quota bypass.
- **npm and GitHub liveness.** An exact match on either is checked against real activity
  (downloads, publish date, repos, followers) before being treated as a live conflict, so
  a package abandoned in 2016 doesn't score the same as one with 600M downloads.
- **Domain squat check.** On a Deep Check, the candidate's `.com` is checked alongside a
  handful of common character-swap lookalikes (`rn`/`m`, `0`/`o`, `1`/`l`), flagged as
  evidence if registered.
- **Cache and health persist across cold starts**, backed by Postgres rather than living
  only in one serverless instance's memory — a repeat scan doesn't re-spend rate limit or
  Tavily credits a warm instance would have avoided, and a source's confidence reflects
  what every instance has seen, not just this one.
- **Keyboard and screen reader.** Skip link on every page, both nav landmarks named,
  research depth as a real radio group, and the comparison grid carries table semantics
  so a score is announced with the name and metric it belongs to. Each of these is
  asserted in the Playwright suite rather than checked once by hand.
- **`npm run check-sources`** hits every new live endpoint once and checks its response
  shape, on its own daily GitHub Actions schedule (`source-health-check.yml`) — separate
  from the PR-blocking suite, since a live check is inherently flakier than the mocked one.

## Status

Live and working: the research engine (22 sources, including five package
registries beyond npm/PyPI, Flathub for Linux desktop apps, a second and third company
register beyond Companies House, OpenStreetMap for local businesses, and Bluesky),
similarity engine, industry relevance, scoring with conflict caps, Trademark Assist,
Compare Names, the name generator (Groq proposes ~30 candidates, every one gets a real
Quick Check, exact conflicts are discarded, the top 5 survivors are ranked), accounts
with history/saved names/share links, per-day quotas, AI explanations on Deep Check
(Groq, grounded against the report's own evidence), a 116-case quality benchmark gating
CI, security headers, Terms/Privacy, optional Turnstile on signup, optional Sentry error
tracking, account data export/deletion, per-source retry, cross-instance cache and
health persistence, share-link Open Graph images, and a printable report.

Not yet built: scoring refinement beyond the caps already in place, and Realtime
transport for scans that survive navigating away.
