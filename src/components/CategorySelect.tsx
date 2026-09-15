'use client'
import { useId, useRef, useState } from 'react'
import { CATEGORY_LABELS, type Category } from '@/lib/core/scan'
const GROUPS: { label: string; categories: Category[] }[] = [
  { label: 'Apps & digital products', categories: ['saas', 'mobile_app', 'game', 'developer_tool'] },
  { label: 'Businesses & services', categories: ['business', 'restaurant', 'finance', 'education'] },
  { label: 'Brands & audiences', categories: ['creator_brand', 'ecommerce', 'fashion', 'other'] },
]
const DESCRIPTIONS: Record<Category, string> = {
  saas: 'Online software and tools', mobile_app: 'iOS and Android apps', game: 'Games and studios',
  developer_tool: 'Libraries and developer tools', business: 'Companies and local services',
  restaurant: 'Food, drinks, and hospitality', finance: 'Financial products and services',
  education: 'Courses and learning', creator_brand: 'Creators, media, and communities',
  ecommerce: 'Products and online shops', fashion: 'Clothing and accessories', other: 'A broad check across categories',
}
export function CategorySelect({ value, onChange, label = 'Use for' }: {
  value: Category; onChange: (category: Category) => void; label?: string
}) {
  const id = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const close = () => { dialog.current?.close(); setOpen(false); trigger.current?.focus() }
  const show = () => {
    dialog.current?.showModal(); setOpen(true)
    dialog.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus({ preventScroll: true })
    if (dialog.current) dialog.current.scrollTop = 0
  }
  return <div className="grid min-w-0 gap-2">
    <span className="text-sm font-medium text-charcoal">{label}</span>
    <button ref={trigger} type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open}
      onClick={show} className="category-trigger field flex w-full min-w-0 items-center justify-between gap-3 rounded-xl px-4 py-3 text-left">
      <span className="min-w-0"><span className="block truncate text-sm font-medium">{CATEGORY_LABELS[value]}</span>
        <span className="mt-1 block truncate text-xs text-faint">{DESCRIPTIONS[value]}</span></span>
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5 shrink-0"><path d="m7 5 5 5-5 5" /></svg>
    </button>
    <dialog ref={dialog} aria-labelledby={id} className="category-dialog" onClose={() => { setOpen(false); trigger.current?.focus() }}
      onClick={event => {
        if (event.target !== event.currentTarget) return
        const b = event.currentTarget.getBoundingClientRect()
        if (event.clientX < b.left || event.clientX > b.right || event.clientY < b.top || event.clientY > b.bottom) close()
      }}>
      <div className="category-dialog-header">
        <div><h2 id={id} className="text-xl font-semibold tracking-tight">Choose a category</h2>
          <p className="mt-1.5 text-sm text-charcoal-2">Pick the closest fit. This helps us put relevant checks first.</p></div>
        <button type="button" onClick={close} aria-label="Close categories" className="category-close">✕</button>
      </div>
      <div role="listbox" aria-label="Categories" className="category-groups" onKeyDown={event => {
        if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'))
        const current = items.indexOf(document.activeElement as HTMLButtonElement)
        const step = ['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 1
        items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + step + items.length) % items.length]?.focus()
      }}>
        {GROUPS.map(group => <section key={group.label} role="group" aria-label={group.label}>
          <h3 className="mb-3 text-xs font-semibold tracking-wide text-faint">{group.label}</h3>
          <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2">
            {group.categories.map(category => <button key={category} type="button" role="option" aria-selected={value === category}
              onClick={() => { onChange(category); close() }} className="category-option">
              <span className="min-w-0"><span className="block text-sm font-medium">{CATEGORY_LABELS[category]}</span>
                <span className="mt-1 block text-xs leading-relaxed text-faint">{DESCRIPTIONS[category]}</span></span>
              <span aria-hidden="true" className="category-check">{value === category ? '✓' : ''}</span>
            </button>)}
          </div>
        </section>)}
      </div>
    </dialog>
  </div>
}
