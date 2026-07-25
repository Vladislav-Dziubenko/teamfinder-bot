"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"

export type StatRange = "7" | "30"

export type OverviewStat = {
  games: number
  wins: number
  favoriteGame: string
  searchMinutes: number
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

type StatsCache = {
  overview: OverviewStat
  achievements: UnlockedAchievement[]
  rank: RankInfo
}

let statsCache: StatsCache | null = null
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

async function loadStats() {
  try {
    const data = await api.get("/api/stats")
    statsCache = {
      overview: data.overview || { games: 0, wins: 0, favoriteGame: "—", searchMinutes: 0, gamesDelta: 0, winsDelta: 0, searchDelta: 0 },
      achievements: (data.achievements?.recent || []).map((a: any) => ({
        id: a.id || "",
        title: a.title || "",
        game: a.game || "",
        icon: a.icon || "🏆",
        unlockedAt: a.unlockedAt || "",
      })),
      rank: data.rank || { position: 0, total: 0, percentile: 0 },
    }
    emit()
  } catch {
    // keep cache
  }
}

export function getOverview(range: StatRange): OverviewStat {
  if (!statsCache) return { games: 0, wins: 0, favoriteGame: "—", searchMinutes: 0, gamesDelta: 0, winsDelta: 0, searchDelta: 0 }
  return statsCache.overview
}

export function getProgress(range: StatRange): ProgressPoint[] {
  return []
}

export function useAchievements(): UnlockedAchievement[] {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    loadStats()
    return () => { listeners.delete(l) }
  }, [])
  return statsCache?.achievements || []
}

export function useRankInfo(): RankInfo {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    loadStats()
    return () => { listeners.delete(l) }
  }, [])
  return statsCache?.rank || { position: 0, total: 0, percentile: 0 }
}

export const recentAchievements: UnlockedAchievement[] = []
export const rankInfo: RankInfo = { position: 0, total: 0, percentile: 0 }
