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
  games: 0,
  wins: 0,
  favoriteGame: "—",
  searchMinutes: 0,
  gamesDelta: 0,
  winsDelta: 0,
  searchDelta: 0,
}

const overview30: OverviewStat = {
  games: 0,
  wins: 0,
  favoriteGame: "—",
  searchMinutes: 0,
  gamesDelta: 0,
  winsDelta: 0,
  searchDelta: 0,
}

const progress7: ProgressPoint[] = []

const progress30: ProgressPoint[] = []

export function getOverview(range: StatRange): OverviewStat {
  return range === "7" ? overview7 : overview30
}

export function getProgress(range: StatRange): ProgressPoint[] {
  return range === "7" ? progress7 : progress30
}

export const recentAchievements: UnlockedAchievement[] = []

export const rankInfo: RankInfo = {
  position: 0,
  total: 0,
  percentile: 0,
}
