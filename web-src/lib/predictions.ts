"use client"

import { useCallback, useEffect, useState } from "react"
// import { api } from "@/lib/api" // ← точка интеграции с реальным API

/* ------------------------------------------------------------------ *
 *  «Прогнозы» — skill-based предсказания (НЕ азартная игра).
 *
 *  Исход определяется реальным результатом матча или решением создателя
 *  PvP-вызова — никакого RNG, рулетки или случайного шанса.
 *
 *  Данные замоканы на фронте. Для реального бэкенда замените тела методов
 *  usePredictions на api.get/api.post, сохранив публичный интерфейс.
 * ------------------------------------------------------------------ */

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
  /** победившая сторона после завершения */
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
const HOUR = 3600_000

/* ---------------- Мок-данные ---------------- */

const seedMatches: EsportsMatch[] = []

const seedPredictions: MatchPrediction[] = []

const seedChallenges: PvpChallenge[] = []

/* ---------------- Хук (публичный API для predictions-tab) ---------------- */

export function usePredictions(seedCoins: number, myNick: string) {
  const [coins, setCoins] = useState(seedCoins)
  const [matches] = useState<EsportsMatch[]>(seedMatches)
  const [predictions, setPredictions] = useState<MatchPrediction[]>(seedPredictions)
  const [challenges, setChallenges] = useState<PvpChallenge[]>(() =>
    seedChallenges.map((c) => (c.creatorId === ME_ID ? { ...c, creatorNick: myNick } : c)),
  )

  // синхронизация стартового баланса, когда монеты из стора догрузились
  useEffect(() => {
    setCoins(seedCoins)
  }, [seedCoins])

  /* --- Режим A: прогнозы на матчи --- */
  const placePrediction = useCallback(
    (match: EsportsMatch, side: "A" | "B", amount: number): { ok: boolean; error?: string } => {
      if (amount <= 0) return { ok: false, error: "Введите сумму прогноза" }
      if (amount > coins) return { ok: false, error: "Недостаточно Nexus Coin" }
      // TODO(api): await api.post("/api/predictions/match", { match_id: match.id, side, amount })
      const odds = side === "A" ? match.oddsA : match.oddsB
      setCoins((c) => c - amount)
      setPredictions((prev) => [
        {
          id: `hp-${Date.now()}`,
          matchId: match.id,
          label: `${match.teamA} vs ${match.teamB} · ${match.tournament}`,
          side,
          team: side === "A" ? match.teamA : match.teamB,
          amount,
          odds,
          status: "pending",
          payout: 0,
        },
        ...prev,
      ])
      return { ok: true }
    },
    [coins],
  )

  /* --- Режим B: PvP-вызовы --- */
  const createChallenge = useCallback(
    (condition: string, stake: number): { ok: boolean; error?: string } => {
      if (condition.trim().length < 5) return { ok: false, error: "Опишите условие подробнее" }
      if (stake <= 0) return { ok: false, error: "Укажите ставку" }
      if (stake > coins) return { ok: false, error: "Недостаточно Nexus Coin" }
      // TODO(api): await api.post("/api/predictions/pvp/create", { condition, stake })
      setCoins((c) => c - stake)
      setChallenges((prev) => [
        {
          id: `pvp-${Date.now()}`,
          creatorId: ME_ID,
          creatorNick: myNick,
          condition: condition.trim(),
          stake,
          status: "open",
          createdAt: Date.now(),
        },
        ...prev,
      ])
      return { ok: true }
    },
    [coins, myNick],
  )

  const acceptChallenge = useCallback(
    (id: string): { ok: boolean; error?: string } => {
      const ch = challenges.find((c) => c.id === id)
      if (!ch) return { ok: false, error: "Вызов не найден" }
      if (ch.stake > coins) return { ok: false, error: "Недостаточно Nexus Coin" }
      // TODO(api): await api.post(`/api/predictions/pvp/${id}/accept`)
      setCoins((c) => c - ch.stake)
      setChallenges((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: "active", opponentId: ME_ID, opponentNick: myNick } : c)),
      )
      return { ok: true }
    },
    [challenges, coins, myNick],
  )

  /** Подтверждение результата — доступно только создателю вызова */
  const confirmResult = useCallback(
    (id: string, winnerId: string) => {
      // TODO(api): await api.post(`/api/predictions/pvp/${id}/resolve`, { winner_id: winnerId })
      setChallenges((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: "finished", winnerId } : c)),
      )
      const ch = challenges.find((c) => c.id === id)
      if (ch && winnerId === ME_ID) {
        // победитель забирает банк (обе ставки)
        setCoins((c) => c + ch.stake * 2)
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
