import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Geist, Oswald } from 'next/font/google'
import Script from 'next/script'
import { ErrorBoundary } from '@/components/error-boundary'
import { I18nProvider } from '@/lib/i18n'
import { ThemeProvider } from '@/lib/theme'
import { TonConnectProvider } from '@/components/ton-provider'
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
  title: 'NEXUS TeamHub — киберспорт тиммейты',
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

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || ""

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ru" className={`dark ${geist.variable} ${oswald.variable}`}>
      <body className="bg-background font-sans antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html: [
              "try{if(localStorage.getItem('nexus-theme')==='light'){document.documentElement.setAttribute('data-theme','light')}}catch(e){}",
              "var _ab=" + JSON.stringify(API_BASE) + ";",
              "function _ce(msg,stk,cstk){try{var b=new Blob([JSON.stringify({message:msg,stack:stk||'',componentStack:cstk||'',tab:window.__NEXUS_TAB||'unknown',url:location.href})],{type:'application/json'});navigator.sendBeacon(_ab+'/api/client-error',b)}catch(e){}}",
              "window.onerror=function(m,s,l,c,err){_ce(typeof m==='object'&&m?m.message||'':String(m),err&&err.stack?err.stack:'');return false};",
              "window.onunhandledrejection=function(e){_ce(e.reason&&e.reason.message?e.reason.message:String(e.reason),e.reason&&e.reason.stack?e.reason.stack:'')};",
            ].join(""),
          }}
        />
        <ErrorBoundary>
          <I18nProvider>
            <ThemeProvider>
              <TonConnectProvider>{children}</TonConnectProvider>
            </ThemeProvider>
          </I18nProvider>
        </ErrorBoundary>
        {process.env.NODE_ENV === 'production' && <Analytics />}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </body>
    </html>
  )
}
