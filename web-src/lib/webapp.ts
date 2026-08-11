"use client"

// Интеграция с Telegram WebApp API: инициализация (expand, цвета темы,
// блокировка вертикальных свайпов) и вибрационная обратная связь (haptics).
// Единый тип TelegramWebApp — остальные модули используют его через глобал.

export type TelegramWebApp = {
  initData: string
  initDataUnsafe?: {
    user?: { id: number; first_name?: string; last_name?: string; username?: string; photo_url?: string; language_code?: string }
  }
  openTelegramLink?: (url: string) => void
  openInvoice?: (url: string, callback?: () => void) => void
  shareURL?: (url: string, text?: string) => void
  ready: () => void
  expand?: () => void
  disableVerticalSwipes?: () => void
  setHeaderColor?: (color: string) => void
  setBackgroundColor?: (color: string) => void
  HapticFeedback?: {
    impactOccurred?: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void
    notificationOccurred?: (type: "error" | "success" | "warning") => void
    selectionChanged?: () => void
  }
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
  }
}

const THEME_BG = "#131417"

let _initDone = false

/** Разово инициализирует WebApp: полный экран, тема, запрет свайпов. */
export function initWebApp(): void {
  if (_initDone) return
  _initDone = true
  if (typeof window === "undefined") return
  const wa = window.Telegram?.WebApp
  if (!wa) return
  try {
    wa.expand?.()
    wa.setHeaderColor?.(THEME_BG)
    wa.setBackgroundColor?.(THEME_BG)
    wa.disableVerticalSwipes?.()
  } catch {}
}

/** Лёгкий тактильный отклик на клики/тапы (пункты, кнопки). */
export function hapticTap(): void {
  try {
    window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.()
  } catch {}
}

/** Средний отклик для действий с результатом (открытие кейса, отправка). */
export function hapticImpact(): void {
  try {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("medium")
  } catch {}
}

/** Уведомление: успех / ошибка. */
export function hapticNotify(type: "success" | "error" | "warning"): void {
  try {
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(type)
  } catch {}
}
