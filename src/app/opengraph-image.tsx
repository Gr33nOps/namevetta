import { ImageResponse } from 'next/og'
import { BRAND } from '@/lib/brand'
import { SCOPE_NOTICE } from '@/lib/presentation'

export const alt = 'NameVetta: research a name before you build on it'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * The site-wide social card.
 *
 * A shared *report* gets its own card under `/r/[token]` carrying that
 * report's real figures. This one stands in for every other page, so it says
 * what the product is rather than inventing numbers it doesn't have.
 */
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: BRAND.canvas,
          padding: '64px 72px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 22, color: BRAND.charcoal2, letterSpacing: 2 }}>
            NAMEVETTA
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 68,
              fontWeight: 700,
              color: BRAND.charcoal,
              marginTop: 20,
              maxWidth: 940,
              lineHeight: 1.1,
            }}
          >
            Research a name before you build on it.
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 26,
              color: BRAND.charcoal2,
              marginTop: 24,
              maxWidth: 880,
              lineHeight: 1.5,
            }}
          >
            Domains, code registries, app stores, company registers, social handles and the open
            web. Every finding shows its evidence.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <div style={{ display: 'flex', width: 4, height: 56, background: BRAND.accent }} />
          <div
            style={{
              display: 'flex',
              fontSize: 20,
              color: BRAND.charcoal2,
              maxWidth: 760,
              lineHeight: 1.5,
            }}
          >
            {SCOPE_NOTICE}
          </div>
        </div>

        <div style={{ display: 'flex', width: '100%', height: 2, background: BRAND.line }} />
      </div>
    ),
    size,
  )
}
