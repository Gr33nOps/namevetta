import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { SOURCE_MANIFEST } from '@/lib/core/adapter'
import { SOURCE_IDS } from '@/lib/core/types'
import Page from './page'

/**
 * Flatten a React element tree to its rendered text, without a DOM or a test
 * renderer — the page is a plain function returning plain elements, so this
 * is just a walk over `.props.children`.
 */
function flatten(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flatten).join(' ')
  if (typeof node === 'object' && 'props' in node) {
    const props = (node as { props?: { children?: ReactNode } }).props
    return flatten(props?.children)
  }
  return ''
}

/**
 * The page is generated from `SOURCE_MANIFEST` so it cannot drift from what
 * actually runs — this pins that down so a future source added to
 * `SOURCE_IDS` and forgotten here fails the build instead of quietly leaving
 * the methodology page incomplete.
 */
describe('methodology page', () => {
  const text = flatten(Page())

  it('mentions every source in the manifest by label', () => {
    for (const id of SOURCE_IDS) {
      expect(text, `${id} should appear on the methodology page`).toContain(SOURCE_MANIFEST[id].label)
    }
  })

  it('states the scope notice', () => {
    expect(text).toContain('NameVetta researches digital availability')
  })
})
