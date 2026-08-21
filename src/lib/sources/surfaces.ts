/**
 * How many distinct identity surfaces a check actually covers.
 *
 * The manifest counts *sources*, and two of them are aggregates: `socials`
 * speaks for five platforms it links out to, and `social_check` for five it
 * probes. Counting manifest entries undercounts the social surfaces by eight;
 * counting platforms and sources together double-counts the two aggregates.
 * So the arithmetic lives here rather than as a number typed into a headline.
 */
import { activeSources } from '@/lib/core/adapter'
import type { SourceId } from '@/lib/core/types'
import { SOURCE_GROUP } from '@/lib/scoring/weights'
import { MANUAL_PLATFORM_NAMES } from '@/lib/sources/socials'
import { CHECKED_PLATFORM_NAMES } from '@/lib/sources/social_check'

/** The two sources that stand in for several platforms each. */
const AGGREGATES: readonly SourceId[] = ['socials', 'social_check']

/**
 * Social and video identity surfaces: one per platform for the aggregates,
 * one per source for everything else in those groups.
 */
export function socialSurfaceCount(): number {
  const singles = activeSources().filter(
    (s) =>
      (SOURCE_GROUP[s.id] === 'social' || SOURCE_GROUP[s.id] === 'youtube') &&
      !AGGREGATES.includes(s.id),
  ).length

  return singles + MANUAL_PLATFORM_NAMES.length + CHECKED_PLATFORM_NAMES.length
}

/** Platforms the product never asserts from automatically, by name. */
export function manualPlatformNames(): readonly string[] {
  return [...MANUAL_PLATFORM_NAMES, 'Slack']
}

/** Platforms the product does check automatically inside `social_check`. */
export function checkedPlatformNames(): readonly string[] {
  return CHECKED_PLATFORM_NAMES
}
