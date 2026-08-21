import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

/**
 * Stamped once when the module first loads, not per request.
 *
 * `new Date()` inside the map would re-date every route on every crawl,
 * telling a search engine the whole site changes continuously. That makes
 * `lastModified` worthless as a signal, which is the opposite of the point.
 */
const LAST_MODIFIED = new Date()

/**
 * Only the pages worth a search engine's attention: the tool pages and the
 * static/legal pages. Account-scoped pages (`/history`, `/saved`, `/account`)
 * and per-search pages (`/scan`, `/r/[token]`) are excluded the same way
 * `robots.ts` excludes them — nothing there is meant to be indexed.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const routes: { path: string; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; priority: number }[] = [
    { path: '/', changeFrequency: 'weekly', priority: 1 },
    { path: '/how-it-works', changeFrequency: 'monthly', priority: 0.6 },
    { path: '/generate', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/status', changeFrequency: 'daily', priority: 0.3 },
    { path: '/terms', changeFrequency: 'yearly', priority: 0.2 },
    { path: '/privacy', changeFrequency: 'yearly', priority: 0.2 },
  ]

  return routes.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified: LAST_MODIFIED,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))
}
