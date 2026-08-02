declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string
        openTelegramLink?: (url: string) => void
        openInvoice?: (url: string, callback?: () => void) => void
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

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  init.signal = controller.signal

  try {
    const res = await fetch(`${API_BASE}${path}`, init)
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      const err = new Error(data.error || `HTTP ${res.status}`) as any
      err.status = res.status
      throw err
    }

    return data
  } catch (e: any) {
    if (e?.name === "AbortError" || e?.name === "TimeoutError") {
      const err = new Error("timeout") as any
      err.timeout = true
      throw err
    }
    throw e
  } finally {
    clearTimeout(timeout)
  }
}

export const api = {
  get: <T = any>(path: string): Promise<T> => request("GET", path) as Promise<T>,
  post: <T = any>(path: string, body?: unknown): Promise<T> => request("POST", path, body) as Promise<T>,
}

export function openTelegramLink(url: string): void {
  if (typeof window !== "undefined" && url) {
    const wa = window.Telegram?.WebApp
    if (wa?.openTelegramLink) {
      wa.openTelegramLink(url)
    } else {
      openLink(url)
    }
  }
}

export function openInvoice(url: string, onClose?: () => void): void {
  if (typeof window !== "undefined" && url) {
    const wa = window.Telegram?.WebApp
    if (wa?.openInvoice) {
      wa.openInvoice(url, () => onClose?.())
    } else {
      openLink(url)
    }
  }
}

export function openLink(url: string) {
  if (typeof window !== "undefined") {
    window.open(url, "_blank")
  }
}
