import { ImageResponse } from 'next/og'
import { BRAND, BRAND_TONE } from '@/lib/brand'
import { CATEGORY_LABELS, type Category } from '@/lib/core/scan'
import { sharedReport } from '@/lib/db/history'
import { SCOPE_NOTICE, VERDICT_PRESENTATION } from '@/lib/presentation'
import type { Verdict } from '@/lib/scoring/viability'

export const alt = 'NameVetta report'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Brand palette from `@/lib/brand`, shared with the site-wide card so the two
// can't quietly drift apart the next time the palette moves.
const CHARCOAL = BRAND.charcoal
const CHARCOAL_2 = BRAND.charcoal2
const CANVAS = BRAND.canvas
const ACCENT = BRAND.accent
const LINE = BRAND.line

const TONE_COLOR = BRAND_TONE

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const report = await sharedReport(token)

  if (report === undefined) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: CANVAS,
            color: CHARCOAL_2,
            fontSize: 36,
          }}
        >
          This report is no longer available.
        </div>
      ),
      size,
    )
  }

  const verdict = report.verdict as Verdict
  const presentation = VERDICT_PRESENTATION[verdict] ?? VERDICT_PRESENTATION.mixed
  const toneColor = TONE_COLOR[presentation.tone] ?? CHARCOAL_2
  const categoryLabel =
    CATEGORY_LABELS[report.category as Category] ?? report.category

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: CANVAS,
          padding: '64px 72px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 22, color: CHARCOAL_2, letterSpacing: 2 }}>
            NAMEVETTA · {categoryLabel.toUpperCase()}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 76,
              fontWeight: 700,
              color: CHARCOAL,
              marginTop: 16,
              maxWidth: 900,
            }}
          >
            {report.name}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 56 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: 22, color: CHARCOAL_2 }}>Digital Viability</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div style={{ display: 'flex', fontSize: 96, fontWeight: 700, color: CHARCOAL }}>
                {report.score}
              </div>
              <div style={{ display: 'flex', fontSize: 28, color: CHARCOAL_2 }}>/ 100</div>
            </div>
            <div
              style={{
                display: 'flex',
                marginTop: 4,
                fontSize: 26,
                fontWeight: 600,
                color: toneColor,
              }}
            >
              {presentation.label}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: 22, color: CHARCOAL_2 }}>Research Coverage</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div style={{ display: 'flex', fontSize: 56, fontWeight: 700, color: CHARCOAL }}>
                {report.coverage}
              </div>
              <div style={{ display: 'flex', fontSize: 24, color: CHARCOAL_2 }}>%</div>
            </div>
          </div>

          <div style={{ display: 'flex', width: 4, height: 64, background: ACCENT }} />

          <div style={{ display: 'flex', fontSize: 20, color: CHARCOAL_2, maxWidth: 340, lineHeight: 1.5 }}>
            {SCOPE_NOTICE}
          </div>
        </div>

        <div style={{ display: 'flex', width: '100%', height: 2, background: LINE, marginTop: 8 }} />
      </div>
    ),
    size,
  )
}
