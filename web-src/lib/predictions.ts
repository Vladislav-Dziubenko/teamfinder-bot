"use client"

import { useCallback, useEffect, useState } from "react"
import { api } from "@/lib/api"

export type EsportsMatch = {
  id: string
  tournament: string
  discipline: string
  teamA: string
  teamB: string
  startsAt: number
  oddsA: number
  oddsB: number
  status: "upcoming" | "finished"
  winner?: "A" | "B"
}

export type MatchPrediction = {
  id: string
  matchId: string
  label: string
  side: "A" | "B"
  team: string
  amount: number
  odds: number
  status: "pending" | "won" | "lost"
  payout: number
}

export type PvpChallenge = {
  id: string
  creatorId: string
  creatorNick: string
  condition: string
  stake: number
  status: "open" | "active" | "finished"
  winnerId?: string
  opponentId?: string
  opponentNick?: string
  createdAt: number
}

export const ME_ID = "me"

export function usePredictions(storeCoins: number, _nick: string) {
  const [matches, setMatches] = useState<EsportsMatch[]>([])
  const [predictions, setPredictions] = useState<MatchPrediction[]>([])
  const [challenges, setChallenges] = useState<PvpChallenge[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [matchData, historyData, pvpData] = await Promise.all([
          api.get("/api/predictions/matches"),
          api.get("/api/predictions/history"),
          api.get("/api/predictions/pvp/list"),
        ])
        if (!cancelled) {
          setMatches(matchData.matches ?? [])
          setPredictions(historyData.predictions ?? [])
          setChallenges(pvpData.challenges ?? [])
        }
      } catch (e) {
        if (!cancelled) console.error("Failed to load predictions", e)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const placePrediction = useCallback(
    async (match: EsportsMatch, side: "A" | "B", amount: number): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await api.post("/api/predictions/place", { match_id: match.id, side, amount })
        if (res.ok) return { ok: true }
        return { ok: false, error: res.error }
      } catch (e: any) {
        return { ok: false, error: e.message }
      }
    },
    [],
  )

  const createChallenge = useCallback(
    async (condition: string, stake: number): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await api.post("/api/predictions/pvp/create", { condition, stake })
        if (res.ok) {
          setChallenges((prev) => [res.challenge, ...prev])
          return { ok: true }
        }
        return { ok: false, error: res.error }
      } catch (e: any) {
        return { ok: false, error: e.message }
      }
    },
    [],
  )

  const acceptChallenge = useCallback(
    async (id: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await api.post(`/api/predictions/pvp/${id}/accept`)
        if (res.ok) {
          setChallenges((prev) => prev.map((c) => (c.id === id ? { ...c, status: "active", opponentId: res.opponentId, opponentNick: res.opponentNick } : c)))
          return { ok: true }
        }
        return { ok: false, error: res.error }
      } catch (e: any) {
        return { ok: false, error: e.message }
      }
    },
    [],
  )

  const confirmResult = useCallback((id: string, winnerId: string) => {
    api.post(`/api/predictions/pvp/${id}/resolve`, { winner_id: winnerId }).catch(() => {})
    setChallenges((prev) => prev.map((c) => (c.id === id ? { ...c, status: "finished", winnerId } : c)))
  }, [])

  return {
    matches,
    predictions,
    challenges,
    coins: storeCoins,
    placePrediction,
    createChallenge,
    acceptChallenge,
    confirmResult,
  }
}
