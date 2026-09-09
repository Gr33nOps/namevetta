/**
 * CRAN package check (R).
 *
 * crandb is the JSON view of the CRAN index: one document per package, 404 when
 * there is none. CRAN's own front end has no API, which is why this uses the
 * database mirror rather than scraping.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const cranAdapter = exactProbeAdapter({
  id: 'cran',
  label: 'CRAN',
  probe: (n) => `https://crandb.r-pkg.org/${encodeURIComponent(n)}`,
  page: (n) => `https://cran.r-project.org/package=${encodeURIComponent(n)}`,
  kind: 'r package',
})
