import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'NEXUS — киберспорт тиммейты',
  description:
    'Telegram Mini App для поиска тиммейтов, команд и гайдов по CS2 и популярным играм',
  generator: 'v0.app',
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#131417',
  userScalable: false,
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="ru"
      className="dark"
      style={
        {
          '--font-geist': '"Inter", "Segoe UI", Roboto, Arial, sans-serif',
          '--font-oswald': '"Oswald", "Arial Narrow", "Segoe UI", sans-serif',
        } as React.CSSProperties
      }
    >
      <body className="bg-background font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
