'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { href: '/', label: 'Search a name', compactLabel: 'Search', match: (path: string) => path === '/' || path.startsWith('/n/') || path.startsWith('/scan') },
  { href: '/generate', label: 'Generate ideas', compactLabel: 'Ideas', match: (path: string) => path.startsWith('/generate') },
  { href: '/history', label: 'History', compactLabel: 'History', match: (path: string) => path.startsWith('/history') },
] as const

/** The three primary tasks stay visible so the current page is never a guess. */
export function PrimaryNav() {
  const pathname = usePathname() ?? '/'

  return (
    <nav aria-label="Main" className="col-span-2 row-start-2 justify-self-center sm:col-span-1 sm:row-start-auto">
      <div className="flex items-center gap-5 sm:gap-8">
        {ITEMS.map((item) => {
          const active = item.match(pathname)

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`group relative inline-flex min-h-10 items-center justify-center px-0 text-[13px] font-medium whitespace-nowrap transition-colors duration-300 [transition-timing-function:var(--nv-ease)] motion-reduce:transition-none sm:text-[14px] ${
                active
                  ? 'font-semibold text-charcoal'
                  : 'text-charcoal-2/75 hover:text-charcoal'
              } focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent`}
            >
              <span className="sm:hidden">{item.compactLabel}</span>
              <span className="hidden sm:inline">{item.label}</span>
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
