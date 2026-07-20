import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Geist, Oswald } from 'next/font/google'
import Script from 'next/script'
import './globals.css'

const geist = Geist({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-geist',
})

const oswald = Oswald({
  subsets: ['latin', 'cyrillic'],
  weight: ['500', '600', '700'],
  variable: '--font-oswald',
})

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
    <html lang="ru" className={`dark ${geist.variable} ${oswald.variable}`}>
      <body className="bg-background font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </body>
    </html>
  )
}
