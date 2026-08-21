import type { Tone } from '@/lib/presentation'
import { TONE_FILL, TONE_TEXT } from '@/lib/presentation'

interface BadgeProps {
  tone: Tone
  children: React.ReactNode
  /**
   * Show the tone glyph. Meaning is carried by text as well as colour so the
   * badge still reads correctly for colour-blind users and in screenshots.
   */
  glyph?: boolean
  className?: string
}

export function Badge({ tone, children, glyph = true, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.04em] whitespace-nowrap ${TONE_TEXT[tone]} ${className}`}
    >
      {glyph ? (
        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${TONE_FILL[tone]}`} />
      ) : null}
      {children}
    </span>
  )
}
