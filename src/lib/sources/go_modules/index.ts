/**
 * Go module check.
 *
 * Go has no global name namespace: a module is its import path, so
 * `github.com/user/repo` is the identity and the GitHub check already covers
 * that half. What is still worth knowing is whether published modules carry
 * this name, which pkg.go.dev's search answers.
 *
 * It answers 200 either way and puts the result in the page, so this reads the
 * body. If that wording ever changes upstream, the check starts reporting
 * names as taken rather than free, which is the safe direction to fail in.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const goModulesAdapter = exactProbeAdapter({
  id: 'go_modules',
  label: 'Go Modules',
  probe: (n) => `https://pkg.go.dev/search?q=${encodeURIComponent(n)}`,
  page: (n) => `https://pkg.go.dev/search?q=${encodeURIComponent(n)}`,
  kind: 'go module',
  claimedFromBody: (body) => !/didn.t match any packages|no matches/i.test(body),
})
