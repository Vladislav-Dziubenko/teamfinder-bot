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

export async function getOverview(range: StatRange): Promise<OverviewStat> {
  return api.get("/api/stats/overview?range=" + range)
}

export async function getProgress(range: StatRange): Promise<ProgressPoint[]> {
  return api.get("/api/stats/progress?range=" + range)
}

export function useRecentAchievements(): UnlockedAchievement[] {
  const [items, setItems] = useState<UnlockedAchievement[]>([])

  useEffect(() => {
    api.get("/api/achievements/recent").then(setItems)
  }, [])

  return items
}

export function useRankInfo(): RankInfo | null {
  const [info, setInfo] = useState<RankInfo | null>(null)

  useEffect(() => {
    api.get("/api/stats/rank").then(setInfo)
  }, [])

  return info
}
