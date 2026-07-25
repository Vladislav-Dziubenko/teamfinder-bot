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
  opponentId?: string
  opponentNick?: string
  status: "open" | "active" | "finished"
  winnerId?: string
  createdAt: number
}

export const ME_ID = "me"

export function usePredictions(seedCoins: number, myNick: string) {
  const [coins, setCoins] = useState(seedCoins)
  const [matches, setMatches] = useState<EsportsMatch[]>([])
  const [predictions, setPredictions] = useState<MatchPrediction[]>([])
  const [challenges, setChallenges] = useState<PvpChallenge[]>([])

  useEffect(() => {
    setCoins(seedCoins)
  }, [seedCoins])

  useEffect(() => {
    api.get("/api/predictions/matches").then((d) => setMatches(d.matches || [])).catch(() => {})
    api.get("/api/predictions/history").then((d) => {
      setPredictions((d.predictions || []).map((p: any) => ({
        id: String(p.id),
        matchId: p.match_id || "",
        label: p.label || "",
        side: p.side || "A",
        team: p.team || "",
        amount: p.amount,
        odds: p.odds,
        status: p.status,
        payout: p.payout || 0,
      })))
    }).catch(() => {})
    api.get("/api/predictions/pvp/list").then((d) => {
      setChallenges((d.challenges || []).map((c: any) => ({
        id: String(c.id),
        creatorId: String(c.creator_id),
        creatorNick: c.creator_nick || "",
        condition: c.condition,
        stake: c.stake,
        status: c.status === "open" ? "open" : "active",
        createdAt: new Date(c.created_at).getTime(),
      })))
    }).catch(() => {})
  }, [])

  const placePrediction = useCallback(
    async (match: EsportsMatch, side: "A" | "B", amount: number): Promise<{ ok: boolean; error?: string }> => {
      if (amount <= 0) return { ok: false, error: "Введите сумму прогноза" }
      if (amount > coins) return { ok: false, error: "Недостаточно Nexus Coin" }
      try {
        await api.post("/api/predictions/place", { match_id: match.id, side, amount })
        setCoins((c) => c - amount)
        const odds = side === "A" ? match.oddsA : match.oddsB
        setPredictions((prev) => [{
          id: `hp-${Date.now()}`,
          matchId: match.id,
          label: `${match.teamA} vs ${match.teamB} · ${match.tournament}`,
          side,
          team: side === "A" ? match.teamA : match.teamB,
          amount,
          odds,
          status: "pending",
          payout: 0,
        }, ...prev])
        return { ok: true }
      } catch (e: any) {
        return { ok: false, error: e.message || "Ошибка" }
      }
    },
    [coins],
  )

  const createChallenge = useCallback(
    async (condition: string, stake: number): Promise<{ ok: boolean; error?: string }> => {
      if (condition.trim().length < 5) return { ok: false, error: "Опишите условие подробнее" }
      if (stake <= 0) return { ok: false, error: "Укажите ставку" }
      if (stake > coins) return { ok: false, error: "Недостаточно Nexus Coin" }
      try {
        const data = await api.post("/api/predictions/pvp/create", { condition, stake })
        setCoins((c) => c - stake)
        setChallenges((prev) => [data.challenge, ...prev])
        return { ok: true }
      } catch (e: any) {
        return { ok: false, error: e.message || "Ошибка" }
      }
    },
    [coins, myNick],
  )

  const acceptChallenge = useCallback(
    async (id: string): Promise<{ ok: boolean; error?: string }> => {
      const ch = challenges.find((c) => c.id === id)
      if (!ch) return { ok: false, error: "Вызов не найден" }
      if (ch.stake > coins) return { ok: false, error: "Недостаточно Nexus Coin" }
      try {
        await api.post(`/api/predictions/pvp/${id}/accept`)
        setCoins((c) => c - ch.stake)
        setChallenges((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: "active", opponentId: ME_ID, opponentNick: myNick } : c)),
        )
        return { ok: true }
      } catch (e: any) {
        return { ok: false, error: e.message || "Ошибка" }
      }
    },
    [challenges, coins, myNick],
  )

  const confirmResult = useCallback(
    async (id: string, winnerId: string) => {
      try {
        await api.post(`/api/predictions/pvp/${id}/resolve`, { winner_id: winnerId })
        setChallenges((prev) => prev.map((c) => (c.id === id ? { ...c, status: "finished", winnerId } : c)))
        const ch = challenges.find((c) => c.id === id)
        if (ch && winnerId === ME_ID) {
          setCoins((c) => c + ch.stake * 2)
        }
      } catch (e) {
        console.error("Failed to resolve challenge", e)
      }
    },
    [challenges],
  )

  return {
    coins,
    matches,
    predictions,
    challenges,
    placePrediction,
    createChallenge,
    acceptChallenge,
    confirmResult,
  }
}
