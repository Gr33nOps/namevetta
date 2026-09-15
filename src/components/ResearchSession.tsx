'use client'

import { createContext, useCallback, useContext, useState, useSyncExternalStore, type ReactNode, type SetStateAction } from 'react'

class Cell<T> {
  value: T
  readonly initial: T
  readonly listeners = new Set<() => void>()
  constructor(value: T) { this.value = value; this.initial = value }
  set = (action: SetStateAction<T>) => {
    const next = typeof action === 'function' ? (action as (prev: T) => T)(this.value) : action
    if (Object.is(next, this.value)) return
    this.value = next
    this.listeners.forEach(listener => listener())
  }
}

// Owned by the root layout, so navigation does not own a request's lifetime.
// No browser storage or server singleton: each tab/provider has its own session.
const SessionContext = createContext<Map<string, unknown> | null>(null)

export function ResearchSession({ children }: { children: ReactNode }) {
  const [cells] = useState(() => new Map<string, unknown>())
  return <SessionContext.Provider value={cells}>{children}</SessionContext.Provider>
}

export function useSessionState<T>(key: string, initial: T | (() => T)) {
  const cells = useContext(SessionContext)
  if (!cells) throw new Error('ResearchSession is required')
  if (!cells.has(key)) {
    const value = typeof initial === 'function' ? (initial as () => T)() : initial
    cells.set(key, new Cell(value))
  }
  const cell = cells.get(key)! as Cell<T>
  const subscribe = useCallback((listener: () => void) => {
    cell.listeners.add(listener)
    return () => { cell.listeners.delete(listener) }
  }, [cell])
  const getSnapshot = useCallback(() => cell.value, [cell])
  const getServerSnapshot = useCallback(() => cell.initial, [cell])
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return [value, cell.set] as const
}
