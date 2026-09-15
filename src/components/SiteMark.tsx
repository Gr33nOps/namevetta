/**
 * The lockup: the mark, then the word.
 *
 * The mark sits straight on the page. It used to sit on a filled dark tile,
 * which gave the violet somewhere to read against but also gave the header a
 * small black box that nothing else in the design justified. `logo.png` has a
 * transparent ground and the mark carries the same violet gradient as the
 * interface, so the tile was solving a problem the file did not have.
 *
 * Drawn a size larger than the tile version, because a mark with a filled
 * shape behind it reads bigger than the same mark alone.
 *
 * `vetta` uses the same reserved brand gradient as the mark and primary
 * actions. Keeping it tokenised stops the lockup drifting from the logo.
 *
 * Shared by the header and the footer so the two can never drift. The header
 * passes `wordFrom="sm"`, which drops the word on a phone: at 375px the row
 * has to hold the mark, two links, the theme control and the account control,
 * and the word is the only part of it a returning visitor does not need.
 */
import Image from 'next/image'

export function SiteMark({
  size = 'md',
  wordFrom,
}: {
  size?: 'sm' | 'md'
  /** Below this breakpoint, show the mark alone. Omitted means always show. */
  wordFrom?: 'sm'
}) {
  const px = size === 'sm' ? 26 : 30
  const word = size === 'sm' ? 'text-[15px]' : 'text-[17px]'

  return (
    <span className="flex items-center gap-2">
      <Image
        src="/logo.png"
        alt=""
        aria-hidden="true"
        width={px}
        height={px}
        className="shrink-0"
        style={{ width: px, height: px }}
      />
      <span
        className={`font-display font-semibold tracking-tight text-charcoal ${word} ${
          wordFrom === 'sm' ? 'hidden sm:inline' : ''
        }`}
      >
        name<span className="brand-gradient-text font-bold">vetta</span>
      </span>
    </span>
  )
}
