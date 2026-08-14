/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        // The embeddable widget and the iframe fallback are meant to be
        // loaded by the municipality's GoHighLevel site.
        source: '/(embed|government-meetings.js)',
        headers: [
          { key: 'X-Frame-Options', value: '' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self' https:" },
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
      {
        source: '/api/public/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, OPTIONS' },
          // Short cache, deliberately.
          //
          // The previous 5-minute edge cache with a 10-minute stale window
          // meant a clerk could publish a meeting and not see it in the
          // embedded widget for up to 15 minutes — with no error and nothing
          // to check. For a public notice system that reads as a fault.
          //
          // `max-age=0` keeps the browser honest while the edge cache still
          // absorbs any real traffic. A municipal archive serves very few
          // requests; freshness is worth more here than cache efficiency.
          { key: 'Cache-Control', value: 'public, max-age=0, s-maxage=60, stale-while-revalidate=120' },
        ],
      },
    ]
  },
}
export default nextConfig
