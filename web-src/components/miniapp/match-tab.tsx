"use client"

import { useState } from "react"
import { Swords, Star, Loader2, Crown, UserX } from "lucide-react"
import { api } from "@/lib/api"
import { useNexus } from "@/lib/store"
import { useI18n } from "@/lib/i18n"
import { PlayerCard } from "./player-card"

const EXTENDED_COST = 8

interface SearchResult {
  id: number
  user_id: number
  nickname: string
  rank: string
  role: string
  playtime: string
  region: string
  score: number
  contact: string | null
}

function resultToPlayer(r: SearchResult, game: string) {
  return {
    id: r.id,
    nick: r.nickname,
    avatar: null,
    game,
    rank: r.rank,
    role: r.role,
    level: 0,
    hours: 0,
    vibe: r.score,
    online: true,
    realName: "",
    winrate: 0,
    lastSeen: "",
    tags: [r.region || "RU", r.playtime],
    voice: true,
    description: "",
    friends: [],
    locked: false,
    reason: null as string | null,
    unlockStars: 0,
  }
}

export function MatchTab({
  onConnect,
  onJoinTeam,
  onChat,
}: {
  onConnect: (p: any) => void
  onJoinTeam: (t: any) => void
  onChat?: (p: any) => void
}) {
  const { t } = useI18n()
  const { freeSearchesLeft, useFreeSearch, spendStars } = useNexus()
  const [extended, setExtended] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [gameName, setGameName] = useState("")

  async function runSearch() {
    if (!extended) {
      const ok = useFreeSearch()
      if (!ok) {
        setNotice(t("match.error_free_exhausted"))
        return
      }
    }
    setNotice(null)
    setLoading(true)
    setResults(null)
    try {
      const data = await api.get("/api/search")
      setResults(data.results || [])
      setGameName(data.game || "")
    } catch (e: any) {
      if (e.message === "no profile") {
        setNotice(t("match.error_no_profile"))
      } else if (e.message === "unauthorized") {
        setNotice(t("match.error_unauthorized"))
      } else {
        setNotice(e.message || t("common.error"))
      }
    } finally {
      setLoading(false)
    }
  }

  async function unlockExtended() {
    const ok = await spendStars(EXTENDED_COST)
    if (!ok) {
      setNotice(t("match.error_not_enough_stars"))
      return
    }
    setExtended(true)
    setNotice(null)
  }

  const noFreeLeft = freeSearchesLeft === 0 && !extended

  return (
    <div className="space-y-4 px-4 py-5">
      <div>
        <h1 className="font-display text-2xl font-bold">{t("match.title")}</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          {t("match.subtitle")}
        </p>
      </div>

      {/* Start search button */}
      <button
        type="button"
        onClick={runSearch}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-bold text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)] transition-transform active:scale-[0.98] disabled:opacity-50"
      >
        {loading ? <Loader2 className="size-5 animate-spin" /> : <Swords className="size-5" />}
        {loading ? t("match.searching") : t("match.cta_search")}
      </button>

      {/* Extended search */}
      <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <Crown className="size-4 text-stars" />
          <span>
            {extended ? (
              <span className="font-semibold text-accent">{t("match.extended_active")}</span>
            ) : (
              <>
                {t("match.extended_label")}{" "}
                <button type="button" onClick={unlockExtended} className="font-semibold text-primary underline underline-offset-2">
                  {EXTENDED_COST} ⭐
                </button>
              </>
            )}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {t("match.free_left", { count: freeSearchesLeft })}
        </span>
      </div>

      {notice && (
        <p className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{notice}</p>
      )}

      {/* Results */}
      {results && results.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <UserX className="size-10 text-muted-foreground" />
          <p className="text-muted-foreground">{gameName ? t("match.no_results_in", { game: gameName }) : t("match.no_results_title")}</p>
          <p className="max-w-xs text-xs text-muted-foreground">{t("match.no_results_hint")}</p>
        </div>
      )}

      {results && results.length > 0 && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {t("match.found_players", { count: results.length, game: gameName ? ` в ${gameName}` : "" })}
          </p>
          {results.map((r, i) => (
            <PlayerCard
              key={r.id}
              player={resultToPlayer(r, gameName)}
              onConnect={onConnect}
              onChat={onChat}
              index={i}
            />
          ))}
        </div>
      )}

      {results === null && !loading && !notice && (
        <div className="py-10 text-center text-sm text-muted-foreground">
          {t("match.hint_search")}
        </div>
      )}
    </div>
  )
}
