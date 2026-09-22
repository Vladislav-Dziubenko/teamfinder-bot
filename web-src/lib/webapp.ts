"use client"

import { useEffect, useState } from "react"

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

// ---------- Настройки вибрации (профиль -> секция "Вибрация") ----------

export type HapticLevel = "light" | "medium" | "heavy"

export type HapticSettings = {
  enabled: boolean
  level: HapticLevel
}

const HAPTIC_KEY = "nexus-haptics"
const DEFAULT_HAPTICS: HapticSettings = { enabled: true, level: "medium" }

function readHapticSettings(): HapticSettings {
  try {
    const raw = localStorage.getItem(HAPTIC_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const level: HapticLevel =
        parsed?.level === "light" || parsed?.level === "heavy" ? parsed.level : "medium"
      return { enabled: parsed?.enabled !== false, level }
    }
  } catch {}
  return { ...DEFAULT_HAPTICS }
}

function writeHapticSettings(s: HapticSettings): void {
  try {
    localStorage.setItem(HAPTIC_KEY, JSON.stringify(s))
  } catch {}
  _hapticListeners.forEach((fn) => {
    try {
      fn(s)
    } catch {}
  })
}

const _hapticListeners = new Set<(s: HapticSettings) => void>()

function subscribeHaptics(fn: (s: HapticSettings) => void): () => void {
  _hapticListeners.add(fn)
  return () => {
    _hapticListeners.delete(fn)
  }
}

export function getHapticSettings(): HapticSettings {
  if (typeof window === "undefined") return { ...DEFAULT_HAPTICS }
  return readHapticSettings()
}

export function setHapticEnabled(enabled: boolean): HapticSettings {
  const next = { ...readHapticSettings(), enabled }
  writeHapticSettings(next)
  return next
}

export function setHapticLevel(level: HapticLevel): HapticSettings {
  const next = { ...readHapticSettings(), level, enabled: true }
  writeHapticSettings(next)
  return next
}

/** Хук настроек вибрации для UI (профиль). Реактивен через подписку. */
export function useHaptics(): {
  settings: HapticSettings
  setEnabled: (v: boolean) => void
  setLevel: (v: HapticLevel) => void
  playTest: () => void
} {
  const [settings, setSettings] = useState<HapticSettings>(() => getHapticSettings())
  useEffect(() => subscribeHaptics(setSettings), [])
  return {
    settings,
    setEnabled: (v: boolean) => setSettings(setHapticEnabled(v)),
    setLevel: (v: HapticLevel) => setSettings(setHapticLevel(v)),
    playTest: () => {
      const s = readHapticSettings()
      if (!s.enabled) return
      hapticImpact(s.level)
      setTimeout(() => hapticNotify("success"), 180)
    },
  }
}

function hapticsOn(): HapticSettings | null {
  const s = getHapticSettings()
  return s.enabled ? s : null
}

/** Лёгкий тактильный отклик на клики/тапы (пункты, кнопки). */
export function hapticTap(): void {
  const s = hapticsOn()
  if (!s) return
  try {
    const hf = window.Telegram?.WebApp?.HapticFeedback
    if (hf?.selectionChanged) {
      hf.selectionChanged()
      return
    }
  } catch {}
  fallbackVibrate(s.level === "light" ? 8 : s.level === "heavy" ? 12 : 10)
}

/** Отклик для действий с результатом (открытие кейса, отправка).
 *  Сила берётся из настроек пользователя — выбранный уровень всегда побеждает. */
export function hapticImpact(_style: "light" | "medium" | "heavy" | "rigid" | "soft" = "medium"): void {
  const s = hapticsOn()
  if (!s) return
  try {
    const hf = window.Telegram?.WebApp?.HapticFeedback
    if (hf?.impactOccurred) {
      hf.impactOccurred(s.level)
      return
    }
  } catch {}
  fallbackVibrate(s.level === "light" ? 10 : s.level === "heavy" ? [20, 30, 20] : 15)
}

/** Уведомление: успех / ошибка. */
export function hapticNotify(type: "success" | "error" | "warning"): void {
  const s = hapticsOn()
  if (!s) return
  try {
    const hf = window.Telegram?.WebApp?.HapticFeedback
    if (hf?.notificationOccurred) {
      hf.notificationOccurred(type)
      return
    }
  } catch {}
  if (type === "error") {
    fallbackVibrate(s.level === "light" ? [15, 40, 15] : [30, 50, 30])
  } else if (type === "warning") {
    fallbackVibrate([15, 40, 15])
  } else {
    fallbackVibrate(s.level === "heavy" ? [15, 30, 25] : 20)
  }
}

/** Приятная вибрация при движении ползунка: лёгкие тики с троттлингом. */
let _lastSliderHaptic = 0
export function hapticSlider(): void {
  const s = hapticsOn()
  if (!s) return
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
