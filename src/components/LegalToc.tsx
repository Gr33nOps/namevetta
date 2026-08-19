/**
 * A sticky table of contents for the legal pages. Plain anchor links, so it
 * needs no client-side scroll-spy — consistent with `ResultsNav`.
 */
export function LegalToc({ items }: { items: readonly { id: string; title: string }[] }) {
  return (
    <nav
      aria-label="Table of contents"
      className="sticky top-20 hidden max-h-[calc(100vh-6rem)] w-56 flex-shrink-0 overflow-y-auto lg:block"
    >
      <p className="font-mono text-[11px] uppercase tracking-widest text-faint">On this page</p>
      <ul className="mt-3 space-y-0.5">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="block border-l-2 border-line py-1 pl-3 text-sm text-charcoal-2 transition-colors hover:border-accent hover:text-charcoal"
            >
              {item.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
