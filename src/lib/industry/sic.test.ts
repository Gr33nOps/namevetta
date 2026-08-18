import { describe, expect, it } from 'vitest'
import { industriesForSicCodes } from './sic'
import { industryById } from './taxonomy'
import { classifyMatch, classifyScan } from './classify'
import { industryRelevance } from './relevance'

describe('industriesForSicCodes', () => {
  it('maps a bank to banking', () => {
    // 64191 is the code MONZO BANK LIMITED actually declares.
    expect(industriesForSicCodes(['64191', '64999'])).toEqual(['banking'])
  })

  it('prefers a five-digit override over its division', () => {
    // Division 58 is publishing, but games publishing belongs with games.
    expect(industriesForSicCodes(['58210'])).toEqual(['gaming'])
    expect(industriesForSicCodes(['58290'])).toEqual(['dev_tools'])
    expect(industriesForSicCodes(['58110'])).toEqual(['publishing'])
  })

  it('keeps the primary code first and de-duplicates the rest', () => {
    expect(industriesForSicCodes(['62012', '62090', '63110'])).toEqual(['dev_tools', 'data'])
  })

  it('ignores dormant and non-trading codes', () => {
    // 99999 is "dormant company"; letting it classify would drown a real code.
    expect(industriesForSicCodes(['99999'])).toEqual([])
    expect(industriesForSicCodes(['99999', '64191'])).toEqual(['banking'])
  })

  it('ignores codes it cannot place rather than guessing', () => {
    expect(industriesForSicCodes(['00000', '', '  '])).toEqual([])
  })

  it('only ever emits real taxonomy nodes', () => {
    // A typo here would silently disable industry relevance for every company
    // carrying that code, which is invisible until a conflict is under-rated.
    const codes = ['64191', '58210', '47910', '96020', '62012', '85200', '86101', '41201']
    for (const id of industriesForSicCodes(codes)) {
      expect(industryById(id), `${id} is not in the taxonomy`).toBeDefined()
    }
  })
})

describe('SIC codes reaching industry relevance', () => {
  it('separates a bank from a tyre fitter for a fintech candidate', () => {
    const scan = classifyScan('finance', 'Mobile banking app and current account')

    const bank = industryRelevance(
      scan,
      classifyMatch({ categories: ['uk-company', ...industriesForSicCodes(['64191'])] }),
    )
    const tyres = industryRelevance(
      scan,
      classifyMatch({ categories: ['uk-company', ...industriesForSicCodes(['45200'])] }),
    )

    expect(bank).toBeGreaterThan(70)
    expect(tyres).toBeLessThan(40)
  })

  it('leaves relevance unknown when a company declares nothing usable', () => {
    // The honest outcome. Severity refuses to escalate an unplaceable match, and
    // inventing a number here would quietly defeat that.
    const scan = classifyScan('finance', 'Mobile banking app and current account')
    expect(industryRelevance(scan, classifyMatch({ categories: ['uk-company'] }))).toBeUndefined()
  })
})
