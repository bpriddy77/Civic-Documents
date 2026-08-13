import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/env'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Draft meetings are never rendered publicly at all; /admin is blocked
      // here as well so it never appears in a search result.
      { userAgent: '*', allow: '/', disallow: ['/admin', '/api/admin', '/sign-in', '/embed'] },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
