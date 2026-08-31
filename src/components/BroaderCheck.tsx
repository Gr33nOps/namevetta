interface BroaderCheckProps {
  checked: boolean
  onChange: (checked: boolean) => void
}

/** Optional free specialist research outside the category selected above. */
export function BroaderCheck({ checked, onChange }: BroaderCheckProps) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm text-charcoal-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-line text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      />
      <span>
        <span className="font-medium text-charcoal">Broader check</span>
        <span className="block text-xs leading-relaxed text-faint">Developer, game, and creator sources.</span>
      </span>
    </label>
  )
}
