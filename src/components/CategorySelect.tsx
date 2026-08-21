'use client'

import { CATEGORY_LABELS, type Category } from '@/lib/core/scan'

const CATEGORY_GROUPS: ReadonlyArray<{ label: string; categories: readonly Category[] }> = [
  { label: 'Digital products', categories: ['saas', 'mobile_app', 'game', 'developer_tool'] },
  { label: 'Business', categories: ['business', 'finance', 'education', 'restaurant'] },
  { label: 'Audience and retail', categories: ['creator_brand', 'ecommerce', 'fashion', 'other'] },
]

const FOCUS: Record<Category, string> = {
  saas: 'Domains, packages, and public web',
  mobile_app: 'App stores, domains, and public web',
  game: 'App stores, communities, and public web',
  developer_tool: 'Packages, code, and domains',
  business: 'Domains, business records, and public web',
  creator_brand: 'Handles, communities, and public web',
  ecommerce: 'Domains, stores, and public web',
  fashion: 'Domains, stores, and public web',
  restaurant: 'Domains, business records, and public web',
  finance: 'Domains, business records, and public web',
  education: 'Domains, communities, and public web',
  other: 'Domains, handles, packages, and public web',
}

/**
 * One category control for searching and generating.
 *
 * A native select turns into a screen-height browser menu on a phone, while a
 * bank of twelve chips hides the relationship between the choices. This keeps
 * the full set, groups it by intent, and closes immediately after a choice.
 */
export function CategorySelect({
  value,
  onChange,
  label = 'Use for',
}: {
  value: Category
  onChange: (category: Category) => void
  label?: string
}) {
  const choose = (category: Category, button: HTMLButtonElement): void => {
    onChange(category)
    const picker = button.closest('details')
    if (picker instanceof HTMLDetailsElement) picker.open = false
  }

  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium text-charcoal">{label}</span>
      <details className="group relative">
        <summary
          aria-label={label}
          className="field flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-3 py-2 marker:content-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium text-charcoal">{CATEGORY_LABELS[value]}</span>
            <span className="mt-0.5 block truncate text-[11px] text-faint">{FOCUS[value]}</span>
          </span>
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-charcoal-2 transition-transform duration-200 group-open:rotate-180"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m3 6 5 5 5-5" />
          </svg>
        </summary>

        <div
          role="listbox"
          aria-label="Categories"
          className="card mt-2 grid w-full gap-4 rounded-2xl p-4 shadow-card"
        >
          {CATEGORY_GROUPS.map((group) => (
            <section key={group.label}>
              <p className="mb-2 text-[10px] font-semibold tracking-[0.12em] text-faint uppercase">
                {group.label}
              </p>
              <div className="grid grid-cols-2 gap-1">
                {group.categories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    role="option"
                    aria-selected={value === category}
                    onClick={(event) => choose(category, event.currentTarget)}
                    className={`rounded-lg px-3 py-2 text-left text-[13px] leading-snug transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:text-sm ${
                      value === category
                        ? 'bg-accent-soft font-semibold text-accent-ink'
                        : 'text-charcoal-2 hover:bg-muted-bg hover:text-charcoal'
                    }`}
                  >
                    {CATEGORY_LABELS[category]}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </details>
    </div>
  )
}
