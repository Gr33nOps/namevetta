/**
 * A horizontally scrollable block that a keyboard can actually reach.
 *
 * `overflow-x: auto` on a bare `<div>` is a trap: a mouse can drag it, a
 * trackpad can swipe it, and a keyboard cannot move it at all. WCAG 2.1
 * treats a scrollable region as needing focus for exactly that reason, so this
 * carries `tabIndex={0}` and a `role`/`aria-label` pair naming what is inside.
 *
 * It also says so on screen. A table that runs past the edge of a phone with
 * no visual hint is indistinguishable from a table that has been cut off, and
 * the audit that prompted this could not tell the difference either.
 */
export function ScrollArea({
  label,
  hint = 'Scroll sideways for the rest',
  className = '',
  children,
}: {
  /** Names the region for a screen reader, e.g. "Score weights by category". */
  label: string
  /** The on-screen affordance. Set to `false` where the block is short. */
  hint?: string | false
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <div
        role="region"
        aria-label={label}
        tabIndex={0}
        className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {children}
      </div>
      {hint === false ? null : (
        // Only where the content is actually wider than its box. `sm:hidden`
        // rather than a measurement: this is a hint, and a hint that needs
        // JavaScript to decide whether to appear is not worth the hydration.
        <p aria-hidden="true" className="mt-1.5 text-xs text-faint sm:hidden">
          {hint} →
        </p>
      )}
    </div>
  )
}
