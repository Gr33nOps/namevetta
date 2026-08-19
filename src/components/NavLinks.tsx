'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const BASE = [
  { href: '/', label: 'New Check' },
  { href: '/generate', label: 'Generate' },
  { href: '/compare', label: 'Compare' },
] as const

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5 fill-current" aria-hidden="true">
      {open ? (
        <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L8.94 10l-4.72 4.72a.75.75 0 1 0 1.06 1.06L10 11.06l4.72 4.72a.75.75 0 1 0 1.06-1.06L11.06 10l4.72-4.72a.75.75 0 0 0-1.06-1.06L10 8.94 5.28 4.22z" />
      ) : (
        <path d="M3 5.5A.75.75 0 0 1 3.75 4.75h12.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 5.5zM3 10a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 10zM3.75 14.25a.75.75 0 0 0 0 1.5h12.5a.75.75 0 0 0 0-1.5H3.75z" />
      )}
    </svg>
  )
}

export function NavLinks({
  signedIn,
  accountsAvailable,
  displayName,
  onSignOut,
}: {
  signedIn: boolean
  accountsAvailable: boolean
  displayName?: string
  onSignOut?: () => Promise<void>
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  const links = [
    ...BASE,
    // One name everywhere — nav, footer, and the page's own eyebrow all say
    // "History" now, rather than switching to "Recent" for guests.
    { href: '/history', label: 'History' },
    // Saved names require an account, so the link only appears with one.
    ...(signedIn ? [{ href: '/saved', label: 'Saved' }] : []),
  ]

  const isActive = (href: string): boolean =>
    href === '/' ? pathname === '/' || pathname.startsWith('/scan') : pathname.startsWith(href)

  return (
    <>
      <nav className="hidden items-center gap-0.5 lg:flex">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              isActive(link.href)
                ? 'bg-accent-soft font-medium text-accent'
                : 'text-charcoal-2 hover:bg-muted-bg hover:text-charcoal'
            }`}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-charcoal-2 transition-colors hover:bg-muted-bg hover:text-charcoal lg:hidden"
      >
        <MenuIcon open={open} />
      </button>

      {open ? (
        <div className="absolute inset-x-0 top-full border-b border-line bg-surface px-6 py-3 shadow-none lg:hidden">
          <nav className="flex flex-col gap-0.5">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive(link.href)
                    ? 'bg-muted-bg font-medium text-charcoal'
                    : 'text-charcoal-2 hover:bg-muted-bg hover:text-charcoal'
                }`}
              >
                {link.label}
              </Link>
            ))}
            {!accountsAvailable ? null : signedIn ? (
              <>
                <Link
                  href="/account"
                  className="rounded-md px-3 py-2 text-sm text-charcoal-2 transition-colors hover:bg-muted-bg hover:text-charcoal"
                >
                  {displayName ?? 'Account'}
                </Link>
                {onSignOut ? (
                  <form action={onSignOut}>
                    <button
                      type="submit"
                      className="w-full rounded-md px-3 py-2 text-left text-sm text-charcoal-2 transition-colors hover:bg-muted-bg hover:text-charcoal"
                    >
                      Sign out
                    </button>
                  </form>
                ) : null}
              </>
            ) : (
              <>
                <Link
                  href="/auth"
                  className="rounded-md px-3 py-2 text-sm text-charcoal-2 transition-colors hover:bg-muted-bg hover:text-charcoal"
                >
                  Sign in
                </Link>
                <Link
                  href="/auth"
                  className="mt-1 rounded-md bg-accent px-3 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
                >
                  Create account
                </Link>
              </>
            )}
          </nav>
        </div>
      ) : null}
    </>
  )
}
