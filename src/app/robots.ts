import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

/**
 * A shared report is deliberately not indexed (see the `robots` metadata on
 * `/r/[token]`) since it should be reachable by whoever it was sent to, not
 * by search. Everything under `/api`, `/account`, `/history` and `/saved` is
 * either not a page or is private by default, so there is nothing for a
 * crawler to usefully index there either.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/account', '/history', '/saved', '/r/', '/auth', '/scan'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
