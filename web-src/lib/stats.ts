"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"

export type StatRange = "7" | "30"

export type GeneralStats = {
  activeDays: number
  totalEvents: number
  searches: number
  contacts: number
  teamApps: number
  caseOpens: number
  adWatches: number
  achievementsByGame: Record<string, number>
  totalAchievements: number
  referrals: number
  currentCoins: number
  eventsByType: Record<string, number>
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

export async function getGeneralStats(period: number): Promise<GeneralStats> {
  return api.get("/api/stats/general?period=" + period)
}

export function useRecentAchievements(): UnlockedAchievement[] {
  const [items, setItems] = useState<UnlockedAchievement[]>([])

  useEffect(() => {
    api.get("/api/achievements/recent").then(setItems).catch(() => setItems([]))
  }, [])

  return items
}

export function useRankInfo(): RankInfo | null {
  const [info, setInfo] = useState<RankInfo | null>(null)

  useEffect(() => {
    api.get("/api/stats/rank").then(setInfo).catch(() => setInfo(null))
  }, [])

  return info
}
