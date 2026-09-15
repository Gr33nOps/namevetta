/**
 * What the user asked us to research.
 *
 * The category drives scoring weights (§19) and, together with the optional
 * free-text description, drives industry relevance (§18) — which is what lets
 * us tell "ENVRYN CLOTHING" apart from "ENVIRON SECURITY SOFTWARE" when the
 * user is naming a cybersecurity SaaS.
 *
 * Roadmap refs: §3 (user search flow), §4/§5 (scan types).
 */
import { z } from 'zod'

/* -------------------------------------------------------------------------- */
/* Categories                                                                 */
/* -------------------------------------------------------------------------- */

/** "What are you naming?" (§3). Order is the order shown in the UI. */
export const CATEGORIES = [
  'saas',
  'mobile_app',
  'game',
  'developer_tool',
  'business',
  'creator_brand',
  'ecommerce',
  'fashion',
  'restaurant',
  'finance',
  'education',
  'other',
] as const

export const CategorySchema = z.enum(CATEGORIES)
export type Category = z.infer<typeof CategorySchema>

export const CATEGORY_LABELS: Record<Category, string> = {
  saas: 'Software / SaaS',
  mobile_app: 'Mobile app',
  game: 'Game',
  developer_tool: 'Developer tool / library',
  business: 'Company / service',
  creator_brand: 'Creator / media / community',
  ecommerce: 'Product / online store',
  fashion: 'Fashion',
  restaurant: 'Restaurant / food',
  finance: 'Finance',
  education: 'Education / course',
  other: 'General brand / not sure',
}

/* -------------------------------------------------------------------------- */
/* Scan type                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `quick` — fast, cheap, generous: domains, GitHub, npm, PyPI, YouTube and
 *           light app/web discovery (§4).
 * `deep`  — the flagship: everything above plus trademark intelligence and
 *           web/common-law research (§5).
 */
export const SCAN_TYPES = ['quick', 'deep'] as const
export const ScanTypeSchema = z.enum(SCAN_TYPES)
export type ScanType = z.infer<typeof ScanTypeSchema>

/* -------------------------------------------------------------------------- */
/* Input                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Upper bound on a candidate name. Long enough for real multi-word brands,
 * short enough to bound abuse and n-gram work (§38 "maximum input length").
 */
export const MAX_NAME_LENGTH = 64
export const MAX_DESCRIPTION_LENGTH = 280

/** A single candidate name as typed by the user, before normalization. */
export const CandidateNameSchema = z
  .string()
  .trim()
  .min(2, 'Enter at least 2 characters')
  .max(MAX_NAME_LENGTH, `Names are limited to ${MAX_NAME_LENGTH} characters`)
  // Reject control characters outright; they are never legitimate in a brand
  // name and are a common vector for spoofing and log injection.
  .refine((s) => !/[\p{Cc}\p{Cf}]/u.test(s), 'Name contains invalid characters')

export const ScanContextSchema = z.object({
  name: CandidateNameSchema,
  category: CategorySchema,
  /** "Describe it" — optional, but dramatically improves relevance (§3). */
  description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).optional(),
  scanType: ScanTypeSchema,
  /** Include free specialist sources outside the selected category. */
  includeSpecialized: z.boolean().optional(),
})
export type ScanContext = z.infer<typeof ScanContextSchema>

/** Comparison runs 2-5 names against the same category (§52). */
export const MIN_COMPARE_NAMES = 2
export const MAX_COMPARE_NAMES = 5
export const GENERATED_NAME_COUNT = 4

export const CompareRequestSchema = z.object({
  names: z
    .array(CandidateNameSchema)
    .min(MIN_COMPARE_NAMES, `Compare at least ${MIN_COMPARE_NAMES} names`)
    .max(MAX_COMPARE_NAMES, `Compare at most ${MAX_COMPARE_NAMES} names`)
    .refine(
      (arr) => new Set(arr.map((n) => n.toLowerCase())).size === arr.length,
      'Names must be distinct',
    ),
  category: CategorySchema,
  description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).optional(),
  scanType: ScanTypeSchema,
})
export type CompareRequest = z.infer<typeof CompareRequestSchema>

/**
 * The name generator (§12): generate a small pool, auto Quick Check, and
 * return the top 5. No `scanType` — every generated candidate is
 * researched with a Quick Check, never Deep, since researching many names
 * to Deep-Check depth in one request is neither fast nor within any
 * reasonable free-tier budget.
 */
export const MIN_GENERATE_DESCRIPTION_LENGTH = 8

/** What an empty or near-empty description is told, on the client and the server. */
export const GENERATE_DESCRIPTION_REQUIRED =
  'Describe what you are naming, in a few words at least. The generator has nothing to work from without it.'

export const GenerateRequestSchema = z.object({
  category: CategorySchema,
  /** Screen generated names against free specialist sources too. */
  includeSpecialized: z.boolean().optional(),
  /**
   * Required, unlike everywhere else this field appears.
   *
   * A blank submission used to reach Groq and then run thirty Quick Checks
   * off a bare category, spending a generation unit to produce names nobody
   * asked for — the prompt itself says "given a category *and description*".
   * The seed below is labelled optional in the form; this one never was, and
   * now the schema agrees with the label.
   */
  description: z
    .string()
    .trim()
    .min(MIN_GENERATE_DESCRIPTION_LENGTH, GENERATE_DESCRIPTION_REQUIRED)
    .max(MAX_DESCRIPTION_LENGTH),
  /** Optional starting point — "names like this one," not a name to check. */
  seed: CandidateNameSchema.optional(),
  /**
   * Stop screening once this many candidates have survived.
   *
   * Every candidate is a full Quick Check run one after another, so a whole
   * full batch takes minutes and can outlast the route's own
   * `maxDuration`. A caller that only needs a handful of names says so and
   * gets them in a fraction of the time.
   *
   * Omitted means screen the whole batch, which is what `/generate` does: it
   * promises the best five in the batch, and it cannot know which those are
   * until it has checked the batch.
   */
  stopAfterSurvivors: z.number().int().min(1).max(MAX_COMPARE_NAMES).optional(),
})
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>
