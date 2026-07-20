declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string
        openTelegramLink?: (url: string) => void
        shareURL?: (url: string, text?: string) => void
        ready: () => void
      }
    }
  }
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || ""

export function getInitData(): string {
  if (typeof window === "undefined") return ""
  return window.Telegram?.WebApp?.initData || ""
}

export function telegramReady(): void {
  if (typeof window !== "undefined" && window.Telegram?.WebApp?.ready) {
    window.Telegram.WebApp.ready()
  }
}

async function request(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = {
    "X-Telegram-Init-Data": getInitData(),
  }
  const init: RequestInit = { method, headers }

  if (body !== undefined) {
    headers["Content-Type"] = "application/json"
    init.body = JSON.stringify(body)
  }

  const res = await fetch(`${API_BASE}${path}`, init)
  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }

  return data
}

export const api = {
  get: (path: string) => request("GET", path),
  post: (path: string, body?: unknown) => request("POST", path, body),
}
