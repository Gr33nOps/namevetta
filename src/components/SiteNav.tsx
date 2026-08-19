import Image from 'next/image'
import Link from 'next/link'
import { ThemeToggle } from './ThemeToggle'

/**
 * The whole navigation.
 *
 * A wordmark and a theme toggle. There is no menu because there is nowhere to
 * go: the product is one search and one result. Sign-in is deliberately absent
 * and appears only when a visitor actually runs out of checks, which is the
 * first moment an account is worth anything to them.
 *
 * A server component still, so it costs no client JavaScript.
 */
export function SiteNav() {
  return (
    <header className="border-b border-line bg-surface print:hidden">
      <div className="mx-auto flex h-14 w-full max-w-[880px] items-center justify-between px-5">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Image src="/logo.png" alt="" width={24} height={24} priority className="h-6 w-6" />
          <span className="text-[14px] font-bold tracking-tight text-charcoal">NameVetta</span>
        </Link>
        <ThemeToggle />
      </div>
    </header>
  )
}
