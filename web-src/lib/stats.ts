// Мок-данные статистики игрока.
// Точка интеграции: заменить на api.get("/api/stats?range=7|30").

export type StatRange = "7" | "30"

export type OverviewStat = {
  games: number
  wins: number
  favoriteGame: string
  searchMinutes: number
  // сравнение с прошлым периодом, % (может быть отрицательным)
  gamesDelta: number
  winsDelta: number
  searchDelta: number
}

export type ProgressPoint = {
  label: string
  games: number
  wins: number
}

export type UnlockedAchievement = {
  id: string
  title: string
  game: string
  icon: string
  unlockedAt: string
}

export type RankInfo = {
  position: number
  total: number
  percentile: number
}

const overview7: OverviewStat = {
  games: 34,
  wins: 21,
  favoriteGame: "CS2",
  searchMinutes: 96,
  gamesDelta: 12,
  winsDelta: 18,
  searchDelta: -8,
}

const overview30: OverviewStat = {
  games: 142,
  wins: 83,
  favoriteGame: "CS2",
  searchMinutes: 410,
  gamesDelta: 6,
  winsDelta: -4,
  searchDelta: 15,
}

const progress7: ProgressPoint[] = [
  { label: "Пн", games: 4, wins: 2 },
  { label: "Вт", games: 6, wins: 4 },
  { label: "Ср", games: 3, wins: 1 },
  { label: "Чт", games: 7, wins: 5 },
  { label: "Пт", games: 5, wins: 3 },
  { label: "Сб", games: 6, wins: 4 },
  { label: "Вс", games: 3, wins: 2 },
]

const progress30: ProgressPoint[] = [
  { label: "1 нед", games: 30, wins: 16 },
  { label: "2 нед", games: 38, wins: 22 },
  { label: "3 нед", games: 34, wins: 19 },
  { label: "4 нед", games: 40, wins: 26 },
]

export function getOverview(range: StatRange): OverviewStat {
  return range === "7" ? overview7 : overview30
}

export function getProgress(range: StatRange): ProgressPoint[] {
  return range === "7" ? progress7 : progress30
}

export const recentAchievements: UnlockedAchievement[] = [
  { id: "ua1", title: "Разминка на 35 минут", game: "CS:GO", icon: "🔥", unlockedAt: "2 ч назад" },
  { id: "ua2", title: "5 побед подряд", game: "CS2", icon: "🏆", unlockedAt: "вчера" },
  { id: "ua3", title: "Танковый экипаж", game: "War Thunder", icon: "🛡️", unlockedAt: "3 дня назад" },
  { id: "ua4", title: "Первый тиммейт", game: "Dota 2", icon: "🤝", unlockedAt: "5 дней назад" },
]

export const rankInfo: RankInfo = {
  position: 6,
  total: 2480,
  percentile: 1,
}
