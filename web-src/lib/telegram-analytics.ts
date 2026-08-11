"use client"

// Telegram Analytics SDK: токен и appName получаются в TON Builders
// (builders.ton.org → Analytics) или у @DataChief_bot.
// В Render env: NEXT_PUBLIC_TELEGRAM_ANALYTICS_TOKEN и
// NEXT_PUBLIC_TELEGRAM_ANALYTICS_APP_NAME. Пока их нет — все вызовы
// тихо no-op, ничего не ломается.

type TgAnalytics = {
  init: (options: { token: string; appName: string }) => void
  sendEvent: (event: string, data?: Record<string, unknown>) => void
}

declare global {
  interface Window {
    TelegramAnalytics?: TgAnalytics
  }
}

const TOKEN = process.env.NEXT_PUBLIC_TELEGRAM_ANALYTICS_TOKEN || ""
const APP_NAME = process.env.NEXT_PUBLIC_TELEGRAM_ANALYTICS_APP_NAME || ""

let _inited = false

function loadSdk(): Promise<void> {
  if (typeof window === "undefined" || !TOKEN) return Promise.resolve()
  return new Promise((resolve) => {
    if (window.TelegramAnalytics) {
      _inited = true
      resolve()
      return
    }
    const s = document.createElement("script")
    s.src = "https://tganalytics.xyz/index.js"
    s.async = true
    s.onload = () => {
      _inited = true
      resolve()
    }
    s.onerror = () => resolve()
    document.head.appendChild(s)
  })
}

export function sendAnalytics(event: string, data?: Record<string, unknown>): void {
  if (!TOKEN || typeof window === "undefined") return
  const wa = window.Telegram?.WebApp
  const payload: Record<string, unknown> = {
    ...(data ?? {}),
    lang: wa?.initDataUnsafe?.user?.language_code ?? "",
  }
  try {
    if (!_inited) {
      loadSdk().then(() => {
        try {
          window.TelegramAnalytics?.init({ token: TOKEN, appName: APP_NAME })
          window.TelegramAnalytics?.sendEvent(event, payload)
        } catch {}
      })
      return
    }
    window.TelegramAnalytics?.sendEvent(event, payload)
  } catch {}
}

export const analytics = {
  page(tab: string): void {
    sendAnalytics("page_view", { tab })
  },
  caseOpen(caseId: string, free: boolean): void {
    sendAnalytics("case_open", { case_id: caseId, free })
  },
  chatSend(): void {
    sendAnalytics("chat_send")
  },
  search(hasResults: boolean): void {
    sendAnalytics("search", { has_results: hasResults })
  },
  referrerClick(): void {
    sendAnalytics("referrer_click")
  },
  donate(amount: number): void {
    sendAnalytics("donate", { amount })
  },
}
