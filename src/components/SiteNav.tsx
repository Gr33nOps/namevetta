'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

/** The wordmark glyph — a stylised N, from the design system. */
function Mark() {
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent">
      <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current text-white" aria-hidden="true">
        <path d="M3 4h2v5.5L13 4h2v12h-2V10.5L5 16H3V4z" />
      </svg>
    </span>
  )
}

const LINKS = [
  { href: '/', label: 'New Check' },
  { href: '/compare', label: 'Compare' },
] as const

export function SiteNav() {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  const isActive = (href: string): boolean =>
    href === '/' ? pathname === '/' || pathname.startsWith('/scan') : pathname.startsWith(href)

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-surface/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Mark />
          <span className="flex items-center text-sm font-semibold tracking-tight text-charcoal">
            NameVetta
            <span className="ml-1.5 rounded border border-line px-1 py-0.5 text-xs font-normal text-faint">
              beta
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                isActive(link.href)
                  ? 'bg-muted-bg font-medium text-charcoal'
                  : 'text-charcoal-2 hover:bg-muted-bg hover:text-charcoal'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {/* Accounts land in Phase 4; the entry points are present but honest
              about not being wired up yet rather than silently doing nothing. */}
          <span className="hidden text-sm text-faint md:block">Accounts coming soon</span>

          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex h-8 w-8 flex-col items-center justify-center gap-1.5 md:hidden"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            <span
              className={`block h-[1.5px] w-5 bg-charcoal transition-all duration-200 ${
                menuOpen ? 'translate-y-[6.75px] rotate-45' : ''
              }`}
            />
            <span
              className={`block h-[1.5px] w-5 bg-charcoal transition-all duration-200 ${
                menuOpen ? 'opacity-0' : ''
              }`}
            />
            <span
              className={`block h-[1.5px] w-5 bg-charcoal transition-all duration-200 ${
                menuOpen ? '-translate-y-[6.75px] -rotate-45' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div className="animate-fade-in border-t border-line bg-surface md:hidden">
          <div className="flex flex-col gap-1 p-4">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-left text-sm text-charcoal hover:bg-muted-bg"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </header>
  )
}
