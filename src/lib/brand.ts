/**
 * Brand colours for anything that renders outside the CSS cascade.
 *
 * `ImageResponse` (the OG image routes) runs Satori, which has no access to
 * the custom properties `globals.css` defines, so these values have to be
 * literals. Keeping the one copy here rather than one per image route is what
 * stops the two drifting apart the next time the palette moves.
 *
 * These are the **light** values from `:root` in `globals.css`. A social card
 * is a fixed PNG with no viewer theme to respect, so it always renders light.
 */
export const BRAND = {
  charcoal: '#16151F',
  charcoal2: '#4A4959',
  canvas: '#FAFAFC',
  surface: '#FFFFFF',
  accent: '#635BFF',
  line: '#E7E6F0',
} as const

/** The status ramp, same source, for tone-coloured text in an OG image. */
export const BRAND_TONE: Record<string, string> = {
  ok: '#059669',
  warn: '#D97706',
  danger: '#DC2626',
}
