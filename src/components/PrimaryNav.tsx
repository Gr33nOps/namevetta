'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { href: '/', label: 'Search a name', compactLabel: 'Search', match: (path: string) => path === '/' || path.startsWith('/n/') || path.startsWith('/scan') },
  { href: '/generate', label: 'Generate ideas', compactLabel: 'Ideas', match: (path: string) => path.startsWith('/generate') },
  { href: '/history', label: 'History', compactLabel: 'History', match: (path: string) => path.startsWith('/history') },
  { href: '/saved', label: 'Saved names', compactLabel: 'Saved', match: (path: string) => path.startsWith('/saved') },
] as const

/** The three primary tasks stay visible so the current page is never a guess. */
export function PrimaryNav() {
  const pathname = usePathname() ?? '/'

  return (
    <nav aria-label="Main" className="col-span-2 row-start-2 flex min-h-12 w-full items-center lg:col-span-1 lg:row-start-auto lg:min-h-16">
      <div className="flex w-full items-center justify-between gap-3 lg:justify-start lg:gap-6">
        {ITEMS.map((item) => {
          const active = item.match(pathname)

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`group relative inline-flex min-h-10 items-center justify-center px-0 text-[13px] font-medium whitespace-nowrap transition-colors duration-300 [transition-timing-function:var(--nv-ease)] motion-reduce:transition-none lg:text-[14px] ${
                active
                  ? 'font-semibold text-charcoal'
                  : 'text-charcoal-2/75 hover:text-charcoal'
              } focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent`}
            >
              <span className="lg:hidden">{item.compactLabel}</span>
              <span className="hidden lg:inline">{item.label}</span>
              <span
                aria-hidden="true"
                className={`brand-gradient-bg pointer-events-none absolute inset-x-0 -bottom-px h-0.5 origin-center rounded-full transition-[opacity,transform] duration-300 [transition-timing-function:var(--nv-ease)] motion-reduce:transition-none ${
                  active ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0 group-hover:scale-x-75 group-hover:opacity-60'
                }`}
              />
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

