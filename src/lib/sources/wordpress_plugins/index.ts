/**
 * WordPress Plugins check.
 *
 * The plugin directory's slug namespace, via the API wp-admin itself uses.
 *
 * Verified against a known-taken and a known-free name before being added.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const wordpressPluginsAdapter = exactProbeAdapter({
  id: 'wordpress_plugins',
  label: 'WordPress Plugins',
  probe: (n) => `https://api.wordpress.org/plugins/info/1.0/${encodeURIComponent(n)}.json`,
  page: (n) => `https://wordpress.org/plugins/${encodeURIComponent(n)}/`,
  kind: 'wordpress plugin',
})
