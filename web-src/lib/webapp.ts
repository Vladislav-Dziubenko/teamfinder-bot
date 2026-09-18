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

function fallbackVibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      ;(navigator as any).vibrate(pattern)
    }
  } catch {}
}

/** Лёгкий тактильный отклик на клики/тапы (пункты, кнопки). */
export function hapticTap(): void {
  try {
    const hf = window.Telegram?.WebApp?.HapticFeedback
    if (hf?.selectionChanged) {
      hf.selectionChanged()
      return
    }
  } catch {}
  fallbackVibrate(8)
}

/** Средний отклик для действий с результатом (открытие кейса, отправка). */
export function hapticImpact(style: "light" | "medium" | "heavy" | "rigid" | "soft" = "medium"): void {
  try {
    const hf = window.Telegram?.WebApp?.HapticFeedback
    if (hf?.impactOccurred) {
      hf.impactOccurred(style)
      return
    }
  } catch {}
  fallbackVibrate(style === "heavy" ? [20, 30, 20] : 15)
}

/** Уведомление: успех / ошибка. */
export function hapticNotify(type: "success" | "error" | "warning"): void {
  try {
    const hf = window.Telegram?.WebApp?.HapticFeedback
    if (hf?.notificationOccurred) {
      hf.notificationOccurred(type)
      return
    }
  } catch {}
  fallbackVibrate(type === "error" ? [30, 50, 30] : type === "warning" ? [15, 40, 15] : 20)
}

/** Приятная вибрация при движении ползунка: лёгкие тики с троттлингом. */
let _lastSliderHaptic = 0
export function hapticSlider(): void {
  const now = Date.now()
  if (now - _lastSliderHaptic < 60) return
  _lastSliderHaptic = now
  try {
    const hf = window.Telegram?.WebApp?.HapticFeedback
    if (hf?.selectionChanged) {
      hf.selectionChanged()
      return
    }
  } catch {}
  fallbackVibrate(5)
}
