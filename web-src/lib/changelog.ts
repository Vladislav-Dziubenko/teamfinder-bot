export const CURRENT_VERSION = "1.2"
export const STORAGE_KEY = "nexus_last_seen_version"

export interface ChangelogItem {
  version: string
  date: string
  isMajor: boolean
  title: { en: string; ru: string }
  items: { en: string[]; ru: string[] }
}

export const updates: ChangelogItem[] = [
  {
    version: "1.2",
    date: "6 Sep 2026",
    isMajor: true,
    title: { en: "Voice Chat & Kick", ru: "Голосовой чат и кик" },
    items: {
      en: [
        "Real-time voice chat with WebRTC",
        "Kick players from sessions",
        "Telegram stickers in global chat",
        "Voice messages in chat",
        "Case weight rebalance",
        "Bug fixes and performance improvements",
      ],
      ru: [
        "Голосовой чат на WebRTC в реальном времени",
        "Кик игроков из сессий",
        "Стикеры Telegram в глобальном чате",
        "Голосовые сообщения в чате",
        "Перебалансировка весов кейсов",
        "Исправления багов и улучшение производительности",
      ],
    },
  },
  {
    version: "1.1",
    date: "1 Sep 2026",
    isMajor: false,
    title: { en: "Marketplace & Cases", ru: "Маркетплейс и кейсы" },
    items: {
      en: [
        "Player marketplace — buy and sell items",
        "Loot cases with animated opening",
        "Battle Pass system",
        "Premium subscriptions",
        "3D model inventory",
      ],
      ru: [
        "Маркетплейс игроков — покупка и продажа предметов",
        "Лут-кейсы с анимированным открытием",
        "Система Battle Pass",
        "Премиум подписки",
        "Инвентарь 3D моделей",
      ],
    },
  },
  {
    version: "1.0",
    date: "25 Aug 2026",
    isMajor: true,
    title: { en: "NEXUS TeamHub Launch", ru: "Запуск NEXUS TeamHub" },
    items: {
      en: [
        "Find teammates for CS2, Dota 2, Valorant and more",
        "Global chat with real-time messaging",
        "Player profiles with stats",
        "Friend system",
        "Leaderboards",
      ],
      ru: [
        "Поиск тиммейтов для CS2, Dota 2, Valorant и других",
        "Глобальный чат с сообщениями в реальном времени",
        "Профили игроков со статистикой",
        "Система друзей",
        "Таблица лидеров",
      ],
    },
  },
]

export function hasNewUpdate(lastSeenVersion: string | null): boolean {
  if (!lastSeenVersion) return true
  return CURRENT_VERSION !== lastSeenVersion
}

export function hasMajorUpdate(lastSeenVersion: string | null): boolean {
  if (!lastSeenVersion) {
    const latest = updates[0]
    return latest?.isMajor ?? false
  }
  const unseen = updates.filter((u) => u.version !== lastSeenVersion)
  return unseen.some((u) => u.isMajor)
}
