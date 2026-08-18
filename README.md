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
| App Store (iTunes Search) | Free | ~20 req/min, documented |
| Wikidata | Zero-dollar | Fair-use limited |
| SEC EDGAR | Free | Fair-access policy; identifying User-Agent required |
| YouTube | Free tier | Quota units per call |
| Social handles | — | **Manual only** |

Nothing in this project scrapes. Where a source cannot be automated legitimately and
for free, the product uses a transparent manual workflow instead of guessing.

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
npm test          # unit and integration tests
npm run typecheck # tsc --noEmit
npm run build     # production build
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — source model, orchestration, scoring, source policy
- [docs/ROADMAP.md](docs/ROADMAP.md) — phase status and what is deliberately not built
- [docs/SCHEMA.md](docs/SCHEMA.md) — database schema and RLS posture

## Status

Live and working: the research engine (9 sources), similarity engine, industry
relevance, scoring with conflict caps, Trademark Assist, Compare Names, persistence
with per-day quotas, and a 103-case quality benchmark gating CI.

Not yet built: accounts and history, share links, AI explanations, the pre-screened
name generator, and three credential-gated sources (web search, Google Play discovery,
Companies House).
