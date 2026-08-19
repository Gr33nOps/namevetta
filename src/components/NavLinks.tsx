'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

const BASE = [
  { href: '/', label: 'New Check' },
  { href: '/generate', label: 'Generate' },
  { href: '/compare', label: 'Compare' },
] as const

const MENU_ID = 'mobile-menu'

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
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Adjusted during render rather than in an effect, per React's guidance for
  // resetting state when a prop changes — it avoids the extra render an effect
  // would cost, and closing the menu on navigation has no external system to
  // synchronize with.
  const [menuPathname, setMenuPathname] = useState(pathname)
  if (pathname !== menuPathname) {
    setMenuPathname(pathname)
    setOpen(false)
  }

  /**
   * The two dismissals every open overlay owes the user: Escape, and a click
   * anywhere outside it. Without them the menu could only be closed by hitting
   * the same small toggle again, which is a trap on a touch screen and a
   * keyboard dead end.
   *
   * Escape returns focus to the toggle rather than leaving it on a node that
   * is about to be removed from the document.
   */
  useEffect(() => {
    if (!open) return

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }

    // `pointerdown`, not `click`: closing on the press means the menu is gone
    // before the underlying element resolves its own click.
    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target as Node
      if (panelRef.current?.contains(target) === true) return
      if (buttonRef.current?.contains(target) === true) return
      setOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

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

  const focusRing =
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

  return (
    <>
      {/*
        Two nav landmarks render on the same page (one per breakpoint), so both
        need a name. Unlabelled, a screen reader's landmark list reads
        "navigation, navigation" with no way to tell them apart.
      */}
      <nav aria-label="Main" className="hidden items-center gap-0.5 lg:flex">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isActive(link.href) ? 'page' : undefined}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${focusRing} ${
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
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls={MENU_ID}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-charcoal-2 transition-colors hover:bg-muted-bg hover:text-charcoal lg:hidden ${focusRing}`}
      >
        <MenuIcon open={open} />
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={MENU_ID}
          className="absolute inset-x-0 top-full border-b border-line bg-surface px-6 py-3 shadow-none lg:hidden"
        >
          <nav aria-label="Mobile" className="flex flex-col gap-0.5">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? 'page' : undefined}
                className={`rounded-md px-3 py-2 text-sm transition-colors ${focusRing} ${
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
                  className={`rounded-md px-3 py-2 text-sm text-charcoal-2 transition-colors hover:bg-muted-bg hover:text-charcoal ${focusRing}`}
                >
                  {displayName ?? 'Account'}
                </Link>
                {onSignOut ? (
                  <form action={onSignOut}>
                    <button
                      type="submit"
                      className={`w-full rounded-md px-3 py-2 text-left text-sm text-charcoal-2 transition-colors hover:bg-muted-bg hover:text-charcoal ${focusRing}`}
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
                  className={`rounded-md px-3 py-2 text-sm text-charcoal-2 transition-colors hover:bg-muted-bg hover:text-charcoal ${focusRing}`}
                >
                  Sign in
                </Link>
                <Link
                  href="/auth"
                  className={`mt-1 rounded-md bg-accent px-3 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-accent-hover ${focusRing}`}
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
