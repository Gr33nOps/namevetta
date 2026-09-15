# Naming generation

The generator uses Gemini 3.8 Flash (`gemini-3.8-flash`) first, with Groq GPT-OSS 120B (`openai/gpt-oss-120b`) as its fallback when Gemini is unavailable. The naming framework supplied on September 8 informs its brief analysis, distinct semantic territories, construction variety, pronunciation/spelling rehearsal, negative-association vetoes and weighted creative review. Creative judgments are not presented as measured user research.

The runtime now materializes its brief analysis, explores three sets of twenty
candidates concurrently, critiques the combined pool, and uses rejected-name feedback for one
optional twenty-candidate refinement. Contextual editorial ranking survives the
availability step. See [the engineering audit](NAMING_PIPELINE_AUDIT.md) for
prompts, parameters, root causes, validation and remaining constraints.

A run requests a broad pool, applies the existing famous-name, structural-quality and near-duplicate filters, and asks the same model for a separate editorial review. That review selects only names from the original pool and can reject all of them. It assesses meaning and fit, not availability. Before editorial review, the pipeline probes the hidden pool for unregistered .com domains (four lookups at a time, bounded to twenty seconds). Domain results warm the lookup cache; they do not remove candidates before editorial review. A natural name can still work with a different extension. Four strong survivors proceed straight to full screening; optional refinement no longer delays them just to seek eight. Known domain responses are reused. Full screening checks the exact .com first, then category-appropriate alternative extensions with RDAP before spending a full Quick Check. Only explicit no-registration responses qualify. Unknown lookups do not qualify. Full checks must have at least 50% evidence coverage, a research score of at least 65, no category-relevant scoring caps. Secondary conflicts, such as an occupied social handle for an app, remain visible and affect the weighted score without automatically discarding the candidate. A free alternative domain does not clear a direct product-name conflict on a primary surface. If exact-name extensions are occupied, verified get/try domain variants can be offered without changing the brand name. A later registered .com result rejects a candidate only when that is its selected domain. Alternative domains are shown with the matching .com status.

Names rejected by availability checks are excluded from replacement rounds, and the reasons are passed into the runtime brief to guide new directions. A completed result contains exactly four candidates. The process is bounded to four generation/editorial rounds, twenty-four full checks (four at a time) and 260 seconds; it returns a clearly labelled partial shortlist when some names pass, or an error when none pass, instead of adding unverified names. Comparison elsewhere remains limited to five names. One generator request still uses one generation quota unit.

RDAP establishes registration-record status, not a purchase guarantee. Registrar confirmation, professional trademark clearance, native-speaker review and real-user recall/spelling tests remain separate. The model must not pretend those activities happened. No domains or accounts are purchased by this flow.

Provider retries stay within the failed stage instead of restarting completed rounds.
Gemini daily-request quota failures are distinguished from short rate limits;
tokens remaining do not imply requests remaining. Transient retries honor the
provider's retry delay. Groq uses a stage-specific answer reservation plus 512 reasoning tokens with low reasoning effort (at most 1,500 total). This model accepted a 1,500-token reservation in a live account probe, unlike the constrained Qwen configuration. Gemini retains its thinking allowance.


## Naming and navigation updates

The three exploration directions cover simple/short/real-word-inspired names,
creative/playful/descriptive names, and pronounceable inventions. Editorial
ordering discounts repeated naming shapes as well as repeated semantic territories.
A 7/10 editorial rating means usable: the weighted threshold is 70, with relevance,
pronunciation and spelling each at least 7 and every dimension at least 6. Missing
scores and explicit editorial vetoes still reject a name.

If a primary provider fails and the fallback works, the same run uses that fallback
for later stages. It tries the primary again if the fallback fails; a new run starts
with the primary. This avoids repeating the same timeout on every naming stage.

Search and generation state live in the root layout's ResearchSession provider.
Leaving a route unsubscribes its UI without aborting the request. Inputs, progress,
errors, reports and shortlists survive in-app navigation. Search links return to
the latest live scan. Each complete search context has its own state and one request
per attempt, including in React Strict Mode. Explicit generation cancellation still
aborts the request. This is tab-memory state, not persistence across reloads or tab
closure, and it is never shared through a server singleton.

Scoring version 5 limits global caps to primary category groups (weight at least
20%) and strong same-industry web collisions. Mobile app-store weights total 60%;
social identity is 6%. All exact conflicts still appear in the evidence, including
zero-weight sources. Coverage continues to report checks that could not be verified.
