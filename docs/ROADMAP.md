# NameVetta — Roadmap

## Positioning

**Know whether your name is worth building on** — digital availability research with evidence behind every result, free every day, private by default.

Scope is stated up front, everywhere: *NameVetta researches digital availability. Trademark and legal clearance are not included.*

## What changed from the original roadmap

The original plan built automated trademark intelligence as the flagship differentiator, requiring a multi-million-row USPTO corpus on Turso, bulk XML ingestion, TSDR hydration, EUIPO production approval, and daily background sync jobs.

**That is removed from V1.** It was the single largest source of cost, operational risk, approval lead time and legal exposure in the product, and it was blocking effort that is better spent making the digital research genuinely excellent.

Trademark checking is **not** removed from the product. It is replaced by **Trademark Assist**: a guided workflow over the official free registry websites, requiring no paid APIs, no database hosting, no scraping, and no production approval.

Automated trademark research returns later as an **optional module** behind the `TrademarkProvider` interface, which ships in V1 as a documented, tested extension point.

### Removed from V1

- Turso USPTO corpus and the 2 GB/5 GB storage budgeting it required
- USPTO bulk XML ingestion and the GitHub Actions delta pipeline
- TSDR automation
- EUIPO API integration, and its register → sandbox → production approval path
- Automated WIPO querying
- Trademark background-update jobs
- Any paid trademark API

### Retained as extension points

- `TrademarkProvider` — the seam an automated jurisdiction plugs into
- `TrademarkImportParser` — the seam for user-supplied registry exports
- Both registries are empty in V1, asserted by test

## The two separate areas

| | Digital Viability Score | Trademark Screening |
|---|---|---|
| How | Automatic | Guided, user-performed |
| Basis | Only sources actually checked | Only registries the user actually searched |
| Output | 0–100 + verdict | `not_started` / `in_progress` / `completed` / `unable_to_verify` |
| Interaction | Never absorbs trademark findings | Never reads as reassuring until completed |

An incomplete trademark check can never produce a green or available result. Banned wording — *legally safe*, *trademark cleared*, *guaranteed available*, *safe to register* — is enforced by a test over the source tree.

## Deployment

Live at **https://namevetta.vercel.app** (Vercel free tier, auto-deploys from ).
Supabase project  in us-east-1.

## Phase status

| Phase | Scope | State |
|---|---|---|
| 0 | Specification: `SourceResult`, statuses, confidence, coverage, scoring, adapter contract | **Done** |
| 1 | Homepage, input, category, progressive scan screen, report | **Done** |
| 2 | Quick Check: Domain/RDAP, GitHub, npm, PyPI, YouTube + orchestrator + streaming | **Done** |
| 3 | Similarity engine: normalization, variants, Levenshtein, Damerau, Jaro-Winkler, n-grams, Double Metaphone | **Done** (pulled forward) |
| T | Trademark Assist + `TrademarkProvider` seam + Digital Viability rename | **Done** |
| 4a | Supabase: schema, RLS, quota functions, data layer, scan persistence | **Done** (awaiting a project to apply against) |
| 4b | Supabase auth, history, saved names, share links | **Done** (Realtime transport deferred) |
| 5 | App Store (iTunes Search, rate-limited), Wikidata, SEC EDGAR, socials | **Done** |
| 6a | YouTube via the official Data API | **Done** |
| 6b | Companies House (free API key), with SIC-code industry mapping | **Done** |
| 6c | Tavily web/Play discovery — last-resort, budget-guarded, never mandatory | **Done** |
| 7 | Industry relevance: 40-node taxonomy, lexicon classifier, central enrichment | **Done** |
| 8 | Socials: YouTube verified, everything else manual-link with honest status | **Done** |
| 9 | Viability engine refinement: sub-scores, caps, category tuning | **Reviewed** — all 12 weight tables verified to sum to 100 (enforced by test), cap logic and dead-code safety nets checked against the schema invariants; no defect found. Real remaining risk reduction comes from growing the golden dataset (§13), which is what actually surfaces scoring bugs. |
| 10 | AI explanations via Groq behind `LLMProvider`, with grounding validator | **Done** |
| 11 | Compare Names — 2–5 names, side-by-side, winner + why | **Done** |
| 12 | Pre-screened name generation: Groq generates 10, auto Quick Check, return the top 5 | **Done** |
| 13 | Golden dataset: 116 labelled cases, false-negative gate in CI | **Done** (grow toward 200/500) |
| 14 | Production hardening: security headers, Terms/Privacy, Turnstile, Sentry, account export/delete | **Done** (retries, backoff and per-source health tracking were already in place from earlier phases) |
| Later | **Optional** automated trademark module: implement `TrademarkProvider` for USPTO/EUIPO | |
| 15 | Package registry breadth — crates.io, RubyGems, NuGet, Docker Hub, Homebrew, all in the existing `packages` group alongside npm/PyPI | **Done** |
| 16 | Source breadth continued — Flathub (grouped with App Store), expanded per-category domain TLDs, 5 more manual-link social platforms. F-Droid evaluated and left out (56 MB index, no lighter search) | **Done** |

Effort freed by dropping automated trademark work is reallocated to phases 5–9 and 11–13 — the digital research quality the product now leads with.

## V1 Trademark Assist

On a Deep Check, all automated digital research completes first. Trademark Assist then appears as its own section and generates, entirely locally:

- the exact name and its normalized form
- spelling variants and likely confusingly similar variants
- phonetic variants (Double Metaphone key)
- likely goods/services wording
- likely Nice classes, with a rationale for each

Then it provides official-search actions:

| Jurisdiction | Registry | Cost |
|---|---|---|
| United States | USPTO Trademark Search (`tmsearch.uspto.gov`) | Free |
| Europe | EUIPO eSearch / TMview (`tmdn.org/tmview`) | Free |
| International | WIPO Global Brand Database (`branddb.wipo.int`) | Free |

Each carries step-by-step instructions and a "what to look for" list. The user searches, returns, and records the outcome per jurisdiction (`Nothing obvious found` / `Found something concerning` / `Could not tell`).

Links point at each registry's **search page**, not a constructed deep query URL: these are SPAs with undocumented query parameters, and a stale deep link that silently searched the wrong thing would be worse than no link at all.

Other national offices can be added later as further manual-search destinations.

**Not done, ever, without explicit permission:** scraping or automated querying of WIPO, USPTO, TMview or any other official registry.

### Optional: import results

Where a registry lets a user download their own search results, `TrademarkImportParser` allows that file to be analysed locally — exact/fuzzy/phonetic similarity, live/dead status, class and industry overlap, conflict ranking.

This is behind a clean adapter and **V1 does not depend on it**. No parser ships until a format is documented and verified reliable.

## Cost model

$0/month to operate. No paid APIs, no paid database plans, no Redis, no subscriptions.

Where something cannot be reliably and legitimately automated for free, the product uses a transparent guided workflow rather than scraping, guessing, or reporting false availability. Trademark Assist is that principle applied to the hardest case.

## Free usage at launch

| | Quick Check | Deep Check |
|---|---|---|
| Guest | 5/day | 1/day |
| Free account | 25/day | 5/day |

Per day, not total. Reopening reports, cached results, saved names, history, comparisons and sharing never consume quota — only fresh research does. Limits are environment-configurable so they can be tuned without redeploying logic.
