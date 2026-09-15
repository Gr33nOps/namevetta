import { expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
vi.mock('@/app/history/actions', () => ({ removeScan: vi.fn(), shareScan: vi.fn() }))
import { HistoryList } from './HistoryList'
it('shows both report actions outside collapsed menus on mobile', () => {
  const html = renderToStaticMarkup(createElement(HistoryList, { entries: [{ id: 'scan-1', name: 'Cedar Table', category: 'restaurant', scanType: 'quick', status: 'complete', createdAt: '2026-09-09T00:00:00Z', score: 80, coverage: 90, verdict: undefined }] }))
  const mobile = html.slice(html.indexOf('<ul'), html.indexOf('</ul>'))
  const visible = mobile.replace(/<details[\s\S]*?<\/details>/g, '')
  expect(visible).toContain('Open report')
  expect(visible).toContain('Research again')
})
