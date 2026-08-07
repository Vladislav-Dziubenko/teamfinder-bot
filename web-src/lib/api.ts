declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string
        initDataUnsafe?: {
          user?: { id: number; first_name?: string; last_name?: string; username?: string; photo_url?: string; language_code?: string }
        }
        openTelegramLink?: (url: string) => void
        openInvoice?: (url: string, callback?: () => void) => void
        shareURL?: (url: string, text?: string) => void
        ready: () => void
      }
    }
  }
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || ""
import { getServerBusySetter } from "./store"

export function getInitData(): string {
  if (typeof window === "undefined") return ""
  const wa = window.Telegram?.WebApp
  if (wa?.initData) return wa.initData
  // Fallback: Telegram может открыть Mini App во внешнем браузере/веб-превью,
  // тогда initData лежит в hash-параметре #tgWebAppData=... без инъекции скрипта.
  try {
    const hash = window.location.hash
    if (hash.startsWith("#tgWebAppData=")) {
      return decodeURIComponent(hash.slice("#tgWebAppData=".length))
    }
  } catch {}
  return ""
}

export function telegramReady(): void {
  if (typeof window !== "undefined" && window.Telegram?.WebApp?.ready) {
    window.Telegram.WebApp.ready()
  }
}

export function getInitDataUser(): { id: number; first_name?: string; last_name?: string; username?: string; language_code?: string } | null {
  if (typeof window === "undefined") return null
  const user = window.Telegram?.WebApp?.initDataUnsafe?.user
  if (user?.id) return user
  // Fallback для веб-превью (#tgWebAppData=...): парсим user из init data строки.
  try {
    const raw = new URLSearchParams(getInitData()).get("user")
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed?.id) return parsed
    }
  } catch {}
  return null
}

// Отправляет имя/фамилию/username пользователя на бэкенд при каждом запуске,
// чтобы профиль был известен даже если юзер никогда не писал боту в ЛС.
export function syncTelegramProfile(): void {
  const u = getInitDataUser()
  if (!u?.id) return
  request("POST", "/api/user/sync", {
    username: u.username || "",
    first_name: u.first_name || "",
    last_name: u.last_name || "",
  }).catch(() => {})
}

async function request(method: string, path: string, body?: unknown, attempt = 0) {
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

    // Сервер ещё прогревается (Render cold start — БД подключается в фоне
    // после открытия порта). Для GET тихо ретраим вместо показа ошибки.
    if (res.status === 503 && method === "GET" && attempt < 10) {
      clearTimeout(timeout)
      await new Promise((r) => setTimeout(r, 800 + attempt * 600))
      return request(method, path, body, attempt + 1)
    }

    // 503 after retries or on POST — server at capacity
    if (res.status === 503) {
      const setter = getServerBusySetter()
      if (setter) setter(true)
    }

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
