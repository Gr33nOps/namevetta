/**
 * Brand colours for anything that renders outside the CSS cascade.
 *
 * `ImageResponse` (the OG image routes) runs Satori, which has no access to
 * the custom properties `globals.css` defines, so these values have to be
 * literals. Keeping the one copy here rather than one per image route is what
 * stops the two drifting apart the next time the palette moves.
 *
 * These are the values from `:root` in `globals.css`, transcribed. `line` is
 * the one that cannot be copied straight across: on the page it is ink at 8%
 * alpha, and Satori is painting it onto a known canvas, so what is written
 * here is that composite.
 */
export const BRAND = {
  charcoal: '#17152B',
  charcoal2: '#4B4869',
  canvas: '#F7F7FC',
  surface: '#FFFFFF',
  accent: '#635BFF',
  accentEnd: '#8B7CFF',
  line: '#E5E5EB',
} as const

/** The status ramp, same source, for tone-coloured text in an OG image. */
export const BRAND_TONE: Record<string, string> = {
  ok: '#06714F',
  warn: '#96520A',
  danger: '#C02A1D',
}

/** Public destinations shown in the product chrome. */
export const BRAND_LINKS = {
  githubShowcase: 'https://github.com/Gr33nOps/namevetta',
  support: 'https://ko-fi.com/zain021xd',
} as const
