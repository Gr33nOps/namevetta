# Naming pipeline audit

## Runtime defects

The original runtime requested 24 candidates in one generation call. Its user
prompt steered most names toward unusual two-word noun pairs. Brief analysis and
territories were requested silently, so later steps could not inspect or reuse
them. The availability loop set `maxAttempts: 1`; a separate editor reviewed only
a small subset. Context-free brandability sorting then overwrote the editorial
order, and availability comparison could alphabetize tied results.

The supplied naming framework was partly distilled into the runtime prompt; it
was not absent. Storing the research attachment was not the principal problem.
The architecture did not preserve or enforce its intermediate decisions.

Live testing also exposed response-contract defects: repeated analysis vocabulary
could reject the whole brief; a malformed territory in one review could discard
all valid decisions; prose review notes could be mistaken for vetoes. Groq
responses did not explicitly reject a truncated completion.

## Implemented flow

1. Materialize purpose, audience, concepts, emotions, vocabulary and six semantic
   territories as validated data. Deduplicate and bound vocabulary.
2. Pass that analysis into three separate explorations of different territories
   and constructions, requesting 20 hidden candidates each.
3. Apply normalization, famous-name checks, structural checks, template rejection
   and near-duplicate exclusion across batches and availability rounds.
4. Review the whole surviving pool in a separate model call. Explicit candidate
   IDs prevent accidental renaming or positional ambiguity. Nine internal scores
   cover relevance, distinctiveness, memorability, pronunciation, spelling,
   brandability, semantic meaning, originality and growth. Vetoed, malformed,
   low-scoring and invented IDs cannot reach the availability checks.
5. When fewer than eight names survive a substantial exploration, request up to
   20 new alternatives using the rejected candidates' weak scoring dimensions
   as feedback, and critique them separately. Never lower the threshold
   merely to fill a list. A round therefore explores 60 to 80 raw candidates;
   duplicates and rejections reduce the actual distinct pool.
6. Rank by contextual editorial scores, with a penalty for repeated territories
   and removal of similar name families. Preserve that order through screening.
7. Keep external conflict checks and verify a suitable exact-name domain. Return exactly
   four screened names or an explicit incomplete result. No additional user fields.

## Provider and schema settings

Gemini 3.8 Flash remains primary; Groq Qwen 3.8 27B remains fallback. Analysis uses
temperature 0.4, exploration/refinement 1.05 and critique 0.25. Each request asks
for JSON. Gemini receives a 3,072-token ceiling with low thinking; the Groq adapter
caps output at 700 because of the observed account limit. Compact review tuples
avoid spending that budget on repetitive explanations. Runtime validation, rather
than a provider-specific strict JSON schema, checks the response.

Retryable failures resume the failed stage, with cancellation and bounded retries.
An explicit abort race prevents a provider that ignores cancellation from holding
the naming stage beyond its deadline. A regression test reproduces that hang.
They do not silently return unreviewed candidates. The analysis is reused across
availability rounds. The existing total request deadline remains 260 seconds.

## Verification and limits

`pipeline.test.ts` covers runtime analysis propagation, contextual ordering,
template rejection, compact decisions, malformed-row isolation, vocabulary
normalization, refinement without weakened thresholds and stage-local retries.
Other regression tests cover readable consonant clusters, provider truncation
and preservation of editorial order in the final shortlist.

Run the six real briefs with:

```powershell
$env:NAMING_QUALITY_LIVE='1'
npx vitest run src/lib/generator/quality.live.test.ts
```

These are real provider calls, not canned names. Local artifacts record stage
inputs, outputs and token counts without API keys. They test creative selection,
not domain availability. `shortlist.live.test.ts` separately exercises external
screening. Model scores are editorial judgments, not measured consumer research.
Passing creative tests does not establish trademark clearance or guarantee four
available exact `.com` names within free-provider quotas.

### Observed live outputs

Five briefs passed on September 10; clothing initially produced only three
survivors and passed its September 13 retest with eight. These are observed
creative outputs, not promises of future output or cleared brands:

| Brief | Examples from the reviewed pool |
| --- | --- |
| Media tracker | Trove, Marquee, ChapterMark |
| Offline secrets manager | Seal, Latch, Cloister |
| Birthday history | Root Ring, First Glow, Year One |
| AI note taking | Subtext, Tideline, GhostNote |
| Premium clothing | Everstitch, Evenfall, Northweft |
| Indie game studio | Pocket Lantern, Underbough, Half Sleep Studio |

Manual review found more natural words and distinct concepts, but also some
borderline compounds such as ReelVault and QuietCurrent. Model judgments remain
fallible. The regression suite protects rejection, deduplication and ordering;
it cannot establish that every future name will be excellent.

On September 13, exact-domain checks rejected all recorded finalists for the
first five briefs (using the original clothing run), because their `.com` domains
were registered. Three studio candidates had no registration record. This is a
separate production constraint: improved creative output does not satisfy the
existing requirement for four unused exact `.com` names. That policy has not been
silently relaxed.

The September 13 full media-tracker run checked 16 candidates and accepted zero;
it then timed out during a provider retry. The provider cancellation hang was
subsequently reproduced and fixed with a passing regression test. The complete
four-available-name flow has not passed live verification, so these changes have
not been published as a completed fix.

## Approved domain policy update

The owner subsequently authorized prioritizing strong names over an unused exact
`.com`. Screening prefers `.com`, then checks three category-appropriate extensions:
software uses `.app`, `.dev`, `.net`; shops and food use `.shop`, `.store`, `.net`;
other categories use `.studio`, `.net`, `.org`. Only explicit RDAP no-registration
responses qualify. The selected domain and `.com` status appear together. Existing
non-domain conflict, minimum coverage and score gates remain in force. A `.com`
becoming registered during screening still rejects a candidate selected on that
domain. Registrar confirmation and trademark review remain separate.

## Recovery behavior

A run still targets four names. When external limits or the deadline prevent
completion, already researched survivors are returned as an explicit `partial`
event with a notice and retry action. They are not presented as a complete four-name
result. Zero survivors remains an error. The entire workflow now has an explicit
timer and abort race, including adapters outside the model call; this addresses
the live hang that the earlier model-only deadline did not resolve.

## Research versus clearance

Further live testing showed namespace occupancy still rejected useful naming
directions. Generation now preserves namespace warnings, score caps and low
research scores in the cards instead of presenting those findings as trademark
clearance or a universal brand veto. Major established same-industry business
conflicts remain a rejection, as does insufficient coverage. Domain variants
(`get{name}.com` / `try{name}.com`) are checked only after exact-name extensions
fail. They change the domain option, never the brand name. This supersedes the
earlier blanket non-domain conflict and 65-point acceptance gates.

