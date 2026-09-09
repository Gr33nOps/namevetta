'use client'

import { useSyncExternalStore } from 'react'

/**
 * Where the choice is kept.
 *
 * The bootstrap script in `layout.tsx` reads the same key before React exists,
 * and two copies of a string like this drift the moment one of them is edited.
 */
export const THEME_KEY = 'nv-theme'

/** Fired on `window` when this tab writes a choice, so the store can re-read. */
const CHANGED = 'nv-theme-change'

export type Theme = 'light' | 'dark'

/** The `theme-color` each palette answers to, from `:root` in globals.css. */
const CHROME_COLOR: Record<Theme, string> = {
  light: '#f8f9fb',
  dark: '#111316',
}

const prefersDark = (): MediaQueryList => window.matchMedia('(prefers-color-scheme: dark)')

/* -------------------------------------------------------------------------- */
/* The store                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The active theme, as an external store rather than as state.
 *
 * It genuinely is external: it lives in `localStorage` and in the OS, both of
 * which can change without React's involvement — a second tab toggling it, or
 * the system flipping at sunset. Mirroring that into `useState` inside an
 * effect is the shape React's own lint rule warns about, and it reads the
 * wrong value for one frame every time.
 *
 * `getServerSnapshot` returns null, and null renders a placeholder. Which
 * theme is active is not knowable on the server or during hydration, so the
 * honest first render is "not yet" rather than a guess that flips a moon to a
 * sun a frame later. Only the button is affected: the *page* is already
 * correct by then, painted by the bootstrap script before any of this runs.
 */
function subscribe(onChange: () => void): () => void {
  /*
    The chrome colour is synced here rather than in an effect. React needs to
    re-render the button; the `<meta>` tag needs rewriting; both are answers to
    the same event, and this is the one place that sees it. An effect would
    also work and would run a render later, for no gain.

    It matters for the case the bootstrap cannot cover: a visitor who has never
    touched the toggle, whose OS flips to dark while the page is open. The
    palette follows on its own — that is what `color-scheme: light dark` does —
    and without this the browser chrome would stay the colour it was.
  */
  const handler = (): void => {
    syncChrome()
    onChange()
  }

  const media = prefersDark()
  media.addEventListener('change', handler)
  // `storage` fires in the other tabs, never the one that wrote; `CHANGED` is
  // this tab's own notification. Both are needed to cover both cases.
  window.addEventListener('storage', handler)
  window.addEventListener(CHANGED, handler)
  return () => {
    media.removeEventListener('change', handler)
    window.removeEventListener('storage', handler)
    window.removeEventListener(CHANGED, handler)
  }
}

function syncChrome(): void {
  const theme = getSnapshot()
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  meta?.setAttribute('content', CHROME_COLOR[theme])
  if (meta !== null) meta.dataset.nvTheme = theme
}

function getSnapshot(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Site data blocked. The system preference is still readable.
  }
  return prefersDark().matches ? 'dark' : 'light'
}

const getServerSnapshot = (): null => null

/**
 * Applies a theme to the document.
 *
 * Two things, not one: the attribute the CSS reads, and the meta tag mobile
 * browsers read to tint the chrome above the page. Miss the second and a phone
 * in dark mode draws a white bar over a black page.
 */
function apply(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  meta?.setAttribute('content', CHROME_COLOR[theme])
  if (meta !== null) meta.dataset.nvTheme = theme
}

/* -------------------------------------------------------------------------- */
/* The control                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The one control that changes how the app looks.
 *
 * Until it is touched there is no `data-theme` attribute at all, and the CSS
 * follows `prefers-color-scheme` on its own — the right default, because a
 * visitor who set their system to dark has already answered this question
 * once. Touching it writes a choice that outranks the system from then on, on
 * this device.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // Server and hydration. The space is held so the header does not shift when
  // the button appears.
  if (theme === null) {
    return <span aria-hidden="true" className="h-9 w-9 shrink-0" />
  }

  const next: Theme = theme === 'light' ? 'dark' : 'light'

  return (
    <button
      type="button"
      onClick={() => {
        try {
          localStorage.setItem(THEME_KEY, next)
        } catch {
          // Blocked storage costs the visitor persistence, not the toggle.
        }
        apply(next)
        window.dispatchEvent(new Event(CHANGED))
      }}
      // The label says what the button does, not what the state is. A control
      // labelled "dark mode" is ambiguous about whether it reports or changes.
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-charcoal-2 transition-colors hover:bg-muted-bg hover:text-charcoal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {theme === 'light' ? <MoonIcon /> : <SunIcon />}
    </button>
  )
}

/* Drawn here rather than in `vetta/Icons.tsx`: those are 24x24 on a 2px stroke
   and decorative beside a label, and these two are 18px and are the whole
   control. */

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.5 14.6A8.5 8.5 0 1 1 9.4 3.5a7 7 0 0 0 11.1 11.1Z" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}
