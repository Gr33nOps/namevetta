import { it, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { checkCandidateDomain } from '@/lib/sources/domain'

it.skipIf(process.env.NAMING_DOMAIN_LIVE !== '1')(
  'checks exact domains for the recorded live creative finalists',
  async () => {
    const reports = []
    for (let index = 1; index <= 6; index++) {
      const run = JSON.parse(
        readFileSync(`artifacts/naming-quality-${index}.json`, 'utf8'),
      )
      const names: string[] = run.result?.names ?? []
      const domains = await Promise.all(
        names.map(async (name) => ({
          name,
          ...(await checkCandidateDomain(name, AbortSignal.timeout(8000))),
        })),
      )
      reports.push({ brief: run.brief, domains })
    }
    writeFileSync(
      'artifacts/naming-domain-verification.json',
      JSON.stringify(reports, null, 2),
    )
    expect(reports.some((report) => report.domains.length > 0)).toBe(true)
  },
  60000,
)
