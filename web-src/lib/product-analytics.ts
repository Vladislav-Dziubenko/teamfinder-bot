"use client"

import { api } from "./api"

export type ProductEvent =
  | "first_open"
  | "app_open"
  | "registration_completed"
  | "teammate_search_started"
  | "teammate_search_empty"
  | "teammate_found"
  | "teammate_profile_opened"
  | "friend_invited"
  | "notification_opened"

function uuid(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return (crypto as any).randomUUID()
    }
  } catch {}
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function storageGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key) ?? localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Отправка продуктового события. Дедуп от повторных рендеров:
 *  - sessionStorage-флаг на текущую загрузку (app_open и подобные);
 *  - localStorage-флаг для once-событий (first_open);
 *  - uuid dedup_key на каждое действие (бэк игнорит повторы);
 *  - бэк дополнительно дедуплицирует once/daily на своей стороне.
 *  Ошибки глотаются — аналитика никогда не ломает продукт. */
export function trackEvent(
  type: ProductEvent,
  metadata?: Record<string, unknown>,
  opts?: { oncePerLoadKey?: string; onceEverKey?: string },
): void {
  try {
    if (typeof window === "undefined") return
    if (opts?.oncePerLoadKey) {
      try {
        if (sessionStorage.getItem(opts.oncePerLoadKey)) return
        sessionStorage.setItem(opts.oncePerLoadKey, "1")
      } catch {}
    }
    if (opts?.onceEverKey) {
      try {
        if (localStorage.getItem(opts.onceEverKey)) return
        localStorage.setItem(opts.onceEverKey, "1")
      } catch {}
    }
    const stored = storageGet("nexus-analytics-uid")
    const body: Record<string, unknown> = {
      event_type: type,
      metadata: metadata ?? {},
      dedup_key: `${stored ?? "anon"}-${type}-${uuid()}`,
    }
    // fire-and-forget: ответ не нужен
    void api.post("/api/analytics/event", body).catch(() => {})
  } catch {}
}

/** Первый запуск Mini App за всё время (localStorage-флаг + once на бэке). */
export function trackFirstOpen(): void {
  trackEvent("first_open", {}, { onceEverKey: "nexus-first-open-sent" })
}

/** Каждый запуск Mini App (флаг на загрузку + раз в день на бэке). */
export function trackAppOpen(): void {
  trackEvent("app_open", {}, { oncePerLoadKey: "nexus-app-open-sent" })
}

/** Возврат через уведомление о тиммейте. */
export function trackNotificationOpened(subscriptionId: number, candidateId: number): void {
  trackEvent(
    "notification_opened",
    { subscription_id: subscriptionId, candidate_id: candidateId },
    { oncePerLoadKey: `nexus-notif-opened-${subscriptionId}-${candidateId}` },
  )
}
