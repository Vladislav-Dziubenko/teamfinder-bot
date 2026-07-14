"use client"

// Обёртка над Telegram WebApp SDK + вызовы к бэкенду бота (webapp/server.py).
// Все запросы идут на тот же домен, где хостится это приложение (Render).

export type TgWebApp = {
  initData: string
  ready: () => void
  expand: () => void
  themeParams: Record<string, string>
  onEvent: (event: string, cb: (...args: any[]) => void) => void
  openInvoice?: (url: string, cb?: (status: string) => void) => void
  openInvoiceLink?: (url: string, cb?: (status: string) => void) => void
  showAlert: (msg: string) => void
  showPopup: (params: { title?: string; message: string; buttons?: { type: string }[] }) => void
  HapticFeedback?: {
    impactOccurred: (style: string) => void
    notificationOccurred: (type: string) => void
  }
}

export function getTelegram(): TgWebApp | null {
  if (typeof window === "undefined") return null
  return (window as any).Telegram?.WebApp ?? null
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const tg = getTelegram()
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": tg?.initData ?? "",
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

// ---------- Типы, которые реально отдаёт бэкенд ----------

export type GameInfo = {
  title: string
  emoji: string
  ranks: string[]
  roles: string[]
}

export type GamesResponse = {
  games: Record<string, GameInfo>
  looking_for: Record<string, string>
  playtime: Record<string, string>
}

export type Profile = {
  user_id: number
  game: string
  nickname: string
  rank: string
  role: string
  playtime: string
  looking_for: string
  region: string
  language: string
  contact: string
  has_mic: number
  description: string
}

export type MeResponse = {
  user: { id: number; first_name?: string; username?: string }
  profile: Profile | null
  premium: boolean
}

export type MatchResult = {
  user_id: number
  nickname: string
  rank: string
  role: string
  playtime: string
  region: string
  score: number
  contact: string | null
}

export type SearchResponse = {
  premium: boolean
  game: string
  results: MatchResult[]
}

export type GuideItem = {
  id: string
  game: string
  title: string
  type: "free" | "premium" | "video"
  stars: number
  unlocked: boolean
}

export type GuideDetail = GuideItem & {
  text?: string
  video_url?: string
  preview?: string
}

// ---------- API ----------

export const api = {
  games: () => request<GamesResponse>("/api/games"),
  me: () => request<MeResponse>("/api/me"),
  saveProfile: (data: Partial<Profile>) =>
    request<{ profile: Profile }>("/api/profile", { method: "POST", body: JSON.stringify(data) }),
  hideProfile: () => request<{ ok: boolean }>("/api/profile/hide", { method: "POST" }),
  search: () => request<SearchResponse>("/api/search"),
  guides: (game?: string) => request<{ guides: GuideItem[] }>(`/api/guides${game ? `?game=${game}` : ""}`),
  guide: (id: string) => request<GuideDetail>(`/api/guides/${id}`),
  createInvoice: (payload: { type: string; guide_id?: string }) =>
    request<{ invoice_link: string }>("/api/pay/invoice", { method: "POST", body: JSON.stringify(payload) }),
}

export async function payWithStars(
  payload: { type: string; guide_id?: string },
  onPaid?: () => void,
) {
  const tg = getTelegram()
  if (!tg) throw new Error("Открой Mini App через Telegram, чтобы оплатить Stars.")
  tg?.HapticFeedback?.impactOccurred("light")
  const { invoice_link } = await api.createInvoice(payload)
  const openInvoice = tg?.openInvoice ?? tg?.openInvoiceLink
  if (!openInvoice) throw new Error("Клиент Telegram не поддерживает оплату Stars.")
  openInvoice?.(invoice_link, (status: string) => {
    if (status === "paid") {
      tg?.showAlert("Оплата прошла успешно!")
      onPaid?.()
    }
  })
}
