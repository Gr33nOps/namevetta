'use client'

import { useLayoutEffect, useState } from 'react'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'nv-theme'

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem(STORAGE_KEY, theme)
}

/** Light/dark toggle. Starts from the system preference, then remembers an explicit choice. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light')

  useLayoutEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    const resolved = stored === 'light' || stored === 'dark' ? stored : systemTheme()
    // `localStorage` and `matchMedia` are both client-only, so the real value
    // can only be known after mount — the same constraint as the isMac
    // detection in SearchForm, and the same fix.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(resolved)
    // Re-apply the inline script's attribute: React Strict Mode clears it on
    // the dev-only remount, so the DOM would otherwise drift from storage.
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored)
    }
  }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-charcoal-2 transition-colors hover:bg-muted-bg hover:text-charcoal"
    >
      {theme === 'dark' ? (
        <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current" aria-hidden="true">
          <path d="M10 2a1 1 0 0 1 1 1v1.5a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1zm0 13.5a1 1 0 0 1 1 1V18a1 1 0 1 1-2 0v-1.5a1 1 0 0 1 1-1zM3.51 3.51a1 1 0 0 1 1.42 0l1.06 1.06a1 1 0 0 1-1.42 1.42L3.51 4.93a1 1 0 0 1 0-1.42zm10.5 10.5a1 1 0 0 1 1.42 0l1.06 1.06a1 1 0 0 1-1.42 1.42l-1.06-1.06a1 1 0 0 1 0-1.42zM2 10a1 1 0 0 1 1-1h1.5a1 1 0 1 1 0 2H3a1 1 0 0 1-1-1zm13.5 0a1 1 0 0 1 1-1H18a1 1 0 1 1 0 2h-1.5a1 1 0 0 1-1-1zM4.93 14.07a1 1 0 0 1 1.42 1.42l-1.06 1.06a1 1 0 1 1-1.42-1.42l1.06-1.06zm10.5-10.5a1 1 0 0 1 1.42 1.42l-1.06 1.06a1 1 0 1 1-1.42-1.42l1.06-1.06zM10 6a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current" aria-hidden="true">
          <path d="M17.5 12.5a7.5 7.5 0 0 1-9.9-9.9.75.75 0 0 0-.9-1A9 9 0 1 0 18.5 13.4a.75.75 0 0 0-1-.9z" />
        </svg>
      )}
    </button>
  )
}
