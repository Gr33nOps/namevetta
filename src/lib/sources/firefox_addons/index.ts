/**
 * Firefox add-on slug check.
 *
 * addons.mozilla.org exposes a versioned public API keyed on the add-on slug,
 * which is the part of the namespace a name would collide with.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const firefoxAddonsAdapter = exactProbeAdapter({
  id: 'firefox_addons',
  label: 'Firefox Add-ons',
  probe: (n) => `https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(n)}/`,
  page: (n) => `https://addons.mozilla.org/firefox/addon/${encodeURIComponent(n)}/`,
  kind: 'browser extension',
})
