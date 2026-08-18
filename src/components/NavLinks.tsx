'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const BASE = [
  { href: '/', label: 'New Check' },
  { href: '/compare', label: 'Compare' },
] as const

export function NavLinks({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname()

  const links = [
    ...BASE,
    { href: '/history', label: signedIn ? 'History' : 'Recent' },
    // Saved names require an account, so the link only appears with one.
    ...(signedIn ? [{ href: '/saved', label: 'Saved' }] : []),
  ]

  const isActive = (href: string): boolean =>
    href === '/' ? pathname === '/' || pathname.startsWith('/scan') : pathname.startsWith(href)

  return (
    <nav className="hidden items-center gap-0.5 md:flex">
      {links.map((link) => (
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
  )
}
