import type { Metadata, Viewport } from 'next'
import './globals.css'
import { getMunicipalityBySlug } from '@/lib/data/tenant'
import { siteUrl } from '@/lib/env'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Zoom is never disabled: WCAG 2.2 requires text to scale to at least 200%.
  maximumScale: 5,
}

export async function generateMetadata(): Promise<Metadata> {
  const municipality = await getMunicipalityBySlug().catch(() => null)
  const name = municipality?.name ?? 'Municipal Records'
  return {
    metadataBase: new URL(siteUrl),
    title: { default: `Meeting Agendas & Minutes | ${name}`, template: `%s | ${name}` },
    description: `Official meeting agendas and minutes for ${name}. Search upcoming and past public meetings and open the posted PDF records.`,
    openGraph: { siteName: name, type: 'website' },
    robots: { index: true, follow: true },
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
