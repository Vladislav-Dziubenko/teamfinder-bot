"use client"

import { useEffect, useState } from "react"
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

export type PredictionStatus = "pending" | "won" | "lost"

export const ME_ID = "me"

export function usePredictions() {
  const [matches, setMatches] = useState<EsportsMatch[]>([])
  const [myPredictions, setMyPredictions] = useState<MatchPrediction[]>([])

  useEffect(() => {
    api
      .get("/api/predictions")
      .then((data: { matches: EsportsMatch[]; myPredictions: MatchPrediction[] }) => {
        setMatches(data.matches)
        setMyPredictions(data.myPredictions)
      })
  }, [])

  return { matches, myPredictions }
}

export async function placePrediction(matchId: string, side: "A" | "B", stars: number) {
  return api.post("/api/predictions/bet", { match_id: matchId, side, stars })
}
