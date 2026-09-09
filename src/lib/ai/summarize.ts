/**
 * AI explanation generation (§25).
 *
 * The orchestration point: build the digest, ask Groq for a summary grounded
 * in it, validate the answer, and hand back one of exactly two outcomes —
 * `ready` or `unavailable`. There is no partial state and no "best effort"
 * text: a summary that failed grounding is worse than none, so it is dropped
 * rather than shown with a caveat.
 *
 * Deliberately kept out of `runScan`. The orchestrator computes scores and
 * evidence, which every test and the benchmark run against directly — forcing
 * a network call and a rate-limited provider into that path would make the
 * whole test suite dependent on Groq being up. This runs as a second step,
 * called by the API route once a `ScanSummary` already exists.
 */
import 'server-only'
import type { ScanContext } from '@/lib/core/scan'
import type { AiSummaryEvent, ScanSummary } from '@/lib/orchestrator/run'
import { completeWithFallback } from '@/lib/providers/fallback'
import { LLMUnavailableError } from '@/lib/providers/llm'
import { buildDigest, digestToPrompt } from './digest'
import { checkGrounding } from './grounding'

export type AiSummaryOutcome = AiSummaryEvent

const SYSTEM_PROMPT = `You explain name-research reports for NameVetta, a tool that checks whether a
business or product name is already in use across domains, code registries, app
stores and other public sources.

You will be given a JSON digest of what was actually found for one name. Write a
short, plain-language explanation in at most 120 words, as 1-2 short
paragraphs with no headings and no markdown, that a non-technical founder can
read in 20 seconds. Stop well within the word limit rather than trailing off
mid-sentence — a shorter finished thought is better than a longer cut-off one.

Hard rules, all of them load-bearing:
- Use ONLY the facts in the digest. Never name a competitor, a company or a
  product that is not listed in "findings". Never state a number that does not
  appear in the digest.
- Keep each number in its proper role. "coverage" is a percentage, not a
  number of sources. Only call something a checked source count when the digest
  explicitly gives that count.
- Never claim or imply a legal conclusion. Do not say a name is "safe",
  "cleared", "available" in a legal sense, or free of trademark risk. This tool
  does not perform legal or trademark clearance, and the explanation must never
  suggest otherwise.
- If "unverifiedSources" is non-empty, say plainly that those sources were not
  checked — never describe them as clear, and never fold them into "no
  conflicts found".
- If "findings" is empty, say no notable conflicts turned up in the sources
  that were checked. Never say or imply the name is free to use — only that
  nothing was found in what was actually checked.
- Be direct about what the score and caps mean in plain terms, and mention the
  single most important finding by name if one exists.
- Plain prose only. No bullet points, no bold text, no disclaimers appended as
  boilerplate — the product shows its own disclaimer separately.`

const RETRY_SUFFIX = `

Your previous answer referenced something not present in the digest. Write it
again, using strictly and only the names and numbers given in the JSON.`

/**
 * Structured, so a spike in grounding rejections is visible in logs without
 * capturing the digest or the user's candidate name itself — only the
 * validator's own failure list, which names *what kind* of thing was rejected
 * (an unlisted number, an unlisted entity, a forbidden phrase) rather than the
 * report content.
 */
function logGroundingFailure(failures: { rule: string; detail: string }[], text: string): void {
  console.warn(JSON.stringify({
    event: 'ai_summary.grounding_failed',
    failures,
    textLength: text.length,
  }))
}

async function attempt(userPrompt: string): Promise<{ text: string; model: string }> {
  const result = await completeWithFallback({
    system: SYSTEM_PROMPT,
    user: userPrompt,
    // 120 words is roughly 160-200 tokens; the rest of the room is headroom so
    // a real answer is never cut off mid-sentence the way a tight ceiling was
    // observed to do against the live model.
    maxOutputTokens: 400,
    temperature: 0.2,
  })
  return { text: result.text.trim(), model: result.model }
}

export async function generateSummary(
  ctx: ScanContext,
  summary: ScanSummary,
): Promise<AiSummaryOutcome> {
  const { digest, facts } = buildDigest({ ctx, summary })
  const prompt = digestToPrompt(digest)

  try {
    const first = await attempt(prompt)
    const firstCheck = checkGrounding(first.text, facts)
    if (firstCheck.ok) return { status: 'ready', text: first.text, model: first.model }
    logGroundingFailure(firstCheck.failures, first.text)

    // One retry, with the failure made explicit to the model. Grounding
    // failures are usually the model reaching for a natural-sounding but
    // unlisted example rather than genuine confusion, and naming the mistake
    // fixes it more often than not.
    const second = await attempt(prompt + RETRY_SUFFIX)
    const secondCheck = checkGrounding(second.text, facts)
    if (secondCheck.ok) return { status: 'ready', text: second.text, model: second.model }
    logGroundingFailure(secondCheck.failures, second.text)

    return {
      status: 'unavailable',
      reason: 'The AI explanation could not be verified against the report and was not shown.',
    }
  } catch (cause) {
    if (cause instanceof LLMUnavailableError) {
      console.error(JSON.stringify({ event: 'ai_summary.llm_unavailable', reason: cause.reason, message: cause.message }))
      const message =
        cause.reason === 'no_api_key'
          ? 'AI explanations are not configured on this deployment.'
          : cause.reason === 'budget_exhausted'
            ? 'The AI explanation allowance for this deployment has been used today.'
            : 'AI explanations are temporarily unavailable.'
      return { status: 'unavailable', reason: message }
    }
    // Not one of the mapped provider outcomes — worth a structured log line so
    // a genuinely new failure mode doesn't hide behind the generic message the
    // user sees. Never logs the digest or prompt content itself.
    console.error(JSON.stringify({
      event: 'ai_summary.failed',
      error: cause instanceof Error ? cause.message : String(cause),
    }))
    return { status: 'unavailable', reason: 'AI explanations are temporarily unavailable.' }
  }
}
