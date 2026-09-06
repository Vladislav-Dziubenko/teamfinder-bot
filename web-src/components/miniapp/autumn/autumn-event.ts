// Nexus Autumn — границы сезона и витрина ивента (Фаза А: поверх существующих кейсов).
// Даты фиксированы в UTC, чтобы все игроки видели один дедлайн.

export const AUTUMN_EVENT_START_MS = Date.UTC(2026, 8, 1)
export const AUTUMN_EVENT_END_MS = Date.UTC(2026, 10, 30, 23, 59, 59)

export type AutumnRemaining = {
  days: number
  hours: number
  mins: number
  secs: number
  ended: boolean
}

export function getAutumnRemaining(now: number = Date.now()): AutumnRemaining {
  const diff = Math.max(0, AUTUMN_EVENT_END_MS - now)
  const totalSecs = Math.floor(diff / 1000)
  return {
    days: Math.floor(totalSecs / 86400),
    hours: Math.floor((totalSecs % 86400) / 3600),
    mins: Math.floor((totalSecs % 3600) / 60),
    secs: totalSecs % 60,
    ended: diff === 0,
  }
}

// Какие существующие кейсы показываем в хабе события:
// обычный (за монеты) + золотой (за звёзды). Порядок = порядок карточек.
export const AUTUMN_SHOWCASE_CASES = ["jet", "gold"] as const
