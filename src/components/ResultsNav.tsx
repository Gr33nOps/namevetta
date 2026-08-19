/**
 * A sticky pill nav for jumping between signal groups on the report page.
 * Plain anchor links, so it works with no JavaScript and needs no scroll-spy.
 */
export function ResultsNav({
  items,
}: {
  items: { id: string; label: string; count: number }[]
}) {
  if (items.length === 0) return null

  return (
    <nav
      aria-label="Jump to signal group"
      className="sticky top-14 z-30 overflow-x-auto rounded-xl border border-line bg-canvas/95 px-2 py-1.5 backdrop-blur-sm print:hidden"
    >
      <ul className="flex items-center gap-1 whitespace-nowrap">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-charcoal-2 transition-colors hover:bg-muted-bg hover:text-charcoal"
            >
              {item.label}
              <span className="font-mono text-xs text-faint">{item.count}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
