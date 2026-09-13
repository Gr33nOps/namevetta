# Naming generation

The generator uses Gemini 3.8 Flash (`gemini-3.8-flash`) first, with Groq Qwen 3.8 27B (`qwen/qwen3.8-27b`) as its fallback when Gemini is unavailable. The naming framework supplied on September 8 informs its brief analysis, distinct semantic territories, construction variety, pronunciation/spelling rehearsal, negative-association vetoes and weighted creative review. Creative judgments are not presented as measured user research.

The runtime now materializes its brief analysis, explores three sets of twenty
candidates, critiques the combined pool, and uses rejected-name feedback for one
optional twenty-candidate refinement. Contextual editorial ranking survives the
availability step. See [the engineering audit](NAMING_PIPELINE_AUDIT.md) for
prompts, parameters, root causes, validation and remaining constraints.

A run requests a broad pool, applies the existing famous-name, structural-quality and near-duplicate filters, and asks the same model for a separate editorial review. That review selects only names from the original pool and can reject all of them. It assesses meaning and fit, not availability. The pipeline checks the exact .com first, then category-appropriate alternative extensions with RDAP before spending a full Quick Check. Only explicit no-registration responses qualify. Unknown lookups do not qualify. Full checks must have at least 50% evidence coverage, a research score of at least 65, no scoring caps and no confirmed conflicts. A free alternative domain does not clear an existing namespace conflict. If exact-name extensions are occupied, verified get/try domain variants can be offered without changing the brand name. A later registered .com result rejects a candidate only when that is its selected domain. Alternative domains are shown with the matching .com status.

Names rejected by availability checks are excluded from replacement rounds, and the reasons are passed into the runtime brief to guide new directions. A completed result contains exactly four candidates. The process is bounded to four generation/editorial rounds, twenty-four full checks (two at a time) and 260 seconds; it returns a clearly labelled partial shortlist when some names pass, or an error when none pass, instead of adding unverified names. Comparison elsewhere remains limited to five names. One generator request still uses one generation quota unit.

RDAP establishes registration-record status, not a purchase guarantee. Registrar confirmation, professional trademark clearance, native-speaker review and real-user recall/spelling tests remain separate. The model must not pretend those activities happened. No domains or accounts are purchased by this flow.

Provider retries stay within the failed stage instead of restarting completed rounds.
Gemini daily-request quota failures are distinguished from short rate limits;
tokens remaining do not imply requests remaining. Transient retries honor the
provider's retry delay. Groq uses a smaller answer reservation for short name
lists while Gemini retains its thinking allowance.
