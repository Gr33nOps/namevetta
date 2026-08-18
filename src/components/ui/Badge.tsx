import type { Tone } from '@/lib/presentation'
import { TONE_CLASSES, TONE_GLYPH } from '@/lib/presentation'

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
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${TONE_CLASSES[tone]} ${className}`}
    >
      {glyph ? (
        <span aria-hidden="true" className="font-semibold">
          {TONE_GLYPH[tone]}
        </span>
      ) : null}
      {children}
    </span>
  )
}
