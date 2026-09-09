/**
 * Trademark Assist.
 *
 * V1's answer to trademark research: rather than automating registries we
 * cannot legitimately automate for free, we do the preparation a person cannot
 * easily do themselves — work out which spellings, sounds, classes and wordings
 * are worth searching — and then hand them straight to the official free search
 * on each registry's own site.
 *
 * Explicitly not done here: no querying, no scraping, no automated access to
 * USPTO, TMview, WIPO or any other registry. Every search action is a link the
 * user clicks and a search the user performs.
 */
import type { ScanContext } from '@/lib/core/scan'
import { suggestClasses, suggestGoodsAndServices, type NiceClass } from './classes'
import type { Jurisdiction } from './provider'
import { normalize } from '@/lib/similarity/normalize'
import { phoneticKeys } from '@/lib/similarity/phonetic'
import { generateVariants } from '@/lib/similarity/variants'

/* -------------------------------------------------------------------------- */
/* Variants                                                                   */
/* -------------------------------------------------------------------------- */

export type AssistVariantKind =
  | 'exact'
  | 'normalized'
  | 'spelling'
  | 'confusable'
  | 'phonetic'

export interface AssistVariant {
  value: string
  kind: AssistVariantKind
  /** Why this is worth searching, shown next to it. */
  reason: string
}

const KIND_ORDER: Record<AssistVariantKind, number> = {
  exact: 0,
  normalized: 1,
  confusable: 2,
  spelling: 3,
  phonetic: 4,
}

/**
 * Build the list of spellings worth searching.
 *
 * Registries match on more than the exact string — examiners and opponents
 * consider confusingly similar marks — so a search of only the literal name is
 * close to useless. This is the part of trademark research that genuinely
 * benefits from automation, and it is entirely local computation.
 */
export function assistVariants(name: string, limit = 12): AssistVariant[] {
  const exact = name.trim()
  const normalized = normalize(exact)

  const out = new Map<string, AssistVariant>()
  const add = (value: string, kind: AssistVariantKind, reason: string): void => {
    const key = value.toLowerCase()
    if (value.length < 2) return
    const existing = out.get(key)
    if (existing !== undefined && KIND_ORDER[existing.kind] <= KIND_ORDER[kind]) return
    out.set(key, { value, kind, reason })
  }

  add(exact, 'exact', 'The name exactly as you would register it.')
  if (normalized !== exact.toLowerCase()) {
    add(normalized, 'normalized', 'Punctuation and spacing removed. Registries index this form too.')
  }

  for (const variant of generateVariants(exact, limit * 2)) {
    if (variant.value === normalized) continue
    switch (variant.kind) {
      case 'vowel_swap':
      case 'letter_swap':
        add(variant.value, 'confusable', 'A near-identical spelling an examiner may treat as confusingly similar.')
        break
      case 'doubled_letter':
      case 'repeat_collapse':
      case 'plural':
        add(variant.value, 'spelling', 'A common spelling drift worth ruling out.')
        break
      case 'separator':
        add(variant.value, 'spelling', 'A separated form that may be registered differently.')
        break
      default:
        break
    }
  }

  // Surface the phonetic key so the user understands *why* certain spellings
  // are grouped, and can search by sound where the registry supports it.
  const keys = phoneticKeys(exact)
  if (keys.primary !== '') {
    add(keys.primary.toLowerCase(), 'phonetic', `Sounds the same (phonetic key ${keys.primary}).`)
  }

  return [...out.values()]
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.value.localeCompare(b.value))
    .slice(0, limit)
}

/* -------------------------------------------------------------------------- */
/* Official search destinations                                               */
/* -------------------------------------------------------------------------- */

export interface SearchDestination {
  jurisdiction: Jurisdiction
  /** The registry's own name. */
  registry: string
  /** Where the user goes. Always the registry's public search page. */
  url: string
  /** Whether the registry is free to search. All V1 destinations are. */
  free: true
  /** Step-by-step instructions for this specific registry. */
  instructions: string[]
  /** What a concerning result looks like here. */
  whatToLookFor: string[]
}

/**
 * The three official registries V1 sends people to.
 *
 * All three are free, public, and intended for exactly this use. We link to the
 * search page rather than constructing a deep query URL: these are
 * single-page applications whose query parameters are undocumented and change
 * without notice, and a stale deep link that silently searches the wrong thing
 * would be worse than no link at all.
 */
export function searchDestinations(): SearchDestination[] {
  return [
    {
      jurisdiction: 'us',
      registry: 'USPTO Trademark Search',
      url: 'https://tmsearch.uspto.gov/',
      free: true,
      instructions: [
        'Open USPTO Trademark Search and choose the basic word-mark search.',
        'Search the exact name first, then work down the variant list below.',
        'Filter to the suggested classes to cut out unrelated industries.',
        'Check both LIVE and DEAD marks. A recently dead mark can still signal prior use.',
      ],
      whatToLookFor: [
        'A LIVE mark with the same or a very similar name in your class.',
        'The owner of any close match, and whether they operate in your field.',
        'The goods and services wording, which matters more than the class number alone.',
      ],
    },
    {
      jurisdiction: 'eu',
      registry: 'EUIPO eSearch / TMview',
      url: 'https://www.tmdn.org/tmview/',
      free: true,
      instructions: [
        'Open TMview, which searches EU and national registries together.',
        'Enter the exact name, then repeat for each variant.',
        'Restrict to the suggested Nice classes.',
        'Note the territory of any match. An EU mark and a single national mark differ in reach.',
      ],
      whatToLookFor: [
        'Registered or pending marks in the EU covering your classes.',
        'Marks held in individual member states where you plan to operate.',
        'Whether a close match is still within its opposition period.',
      ],
    },
    {
      jurisdiction: 'international',
      registry: 'WIPO Global Brand Database',
      url: 'https://branddb.wipo.int/',
      free: true,
      instructions: [
        'Open the WIPO Global Brand Database, which spans many national registries at once.',
        'Search the exact name, then the phonetic variant.',
        'Use it to spot jurisdictions you had not thought about.',
      ],
      whatToLookFor: [
        'International registrations that may extend into your markets.',
        'The same name already established in a country you plan to expand to.',
      ],
    },
  ]
}

/* -------------------------------------------------------------------------- */
/* The prepared brief                                                         */
/* -------------------------------------------------------------------------- */

export interface TrademarkAssistBrief {
  name: string
  variants: AssistVariant[]
  classes: NiceClass[]
  goodsAndServices: string[]
  destinations: SearchDestination[]
  /** Total searches the user is being asked to perform, for expectation-setting. */
  estimatedSearches: number
}

/**
 * Prepare everything the user needs before touching a registry.
 *
 * All local computation — no network, no registry access, and therefore no cost
 * and no terms-of-service exposure.
 */
export function buildAssistBrief(ctx: ScanContext): TrademarkAssistBrief {
  const variants = assistVariants(ctx.name)
  const classes = suggestClasses(ctx.category, ctx.description)
  const destinations = searchDestinations()

  return {
    name: ctx.name,
    variants,
    classes,
    goodsAndServices: suggestGoodsAndServices(ctx.category, ctx.description),
    destinations,
    // A realistic count: the user does not need every variant in every registry,
    // so this reflects the exact name everywhere plus the confusable variants
    // in the primary jurisdiction.
    estimatedSearches:
      destinations.length + variants.filter((v) => v.kind === 'confusable').length,
  }
}

/** Shown wherever trademark information appears. Never softened. */
export const TRADEMARK_ASSIST_DISCLAIMER =
  'Preliminary trademark research only. This is not legal clearance or legal advice.'

/** Stated up front so the scope of the product is never in doubt. */
export const TRADEMARK_SCOPE_NOTICE =
  'NameVetta does not perform automated trademark searching. It prepares your search and links you to the official free registries, which you search yourself.'
