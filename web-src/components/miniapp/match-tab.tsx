"use client"

import { useMemo, useState } from "react"
import { Search, Sparkles, Star, Lock, Zap, Loader2 } from "lucide-react"
import { games } from "@/lib/data"
import type { Player, Team } from "@/lib/data"
import { useI18n } from "@/lib/i18n"
import { useNexus } from "@/lib/store"
import { api } from "@/lib/api"
import { PlayerCard } from "./player-card"
import { TeamCard } from "./team-card"
import { cn } from "@/lib/utils"

type SortKey = "match" | "level" | "rank" | "time"

const EXTENDED_COST = 15

export function MatchTab({
  onConnect,
  onJoinTeam,
  onChat,
}: {
  onConnect: (p: Player) => void
  onJoinTeam: (t: Team) => void
  onChat?: (p: Player) => void
}) {
  const { t } = useI18n()
  const { freeSearchesLeft, useFreeSearch, spendStars, unlockPlayer, unlockedPlayers } = useNexus()

  const [mode, setMode] = useState<"players" | "teams">("players")
  const [game, setGame] = useState<string>("all")
  const [query, setQuery] = useState("")
  const [applied, setApplied] = useState("")
  const [sort, setSort] = useState<SortKey>("match")
  const [extended, setExtended] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<{ players: Player[]; teams: Team[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  const rankOrder = ["Global Elite", "Legendary Eagle Master", "Legendary Eagle", "Immortal 2", "Ascendant 1", "Divine 3"]

  async function runSearch() {
    const q = query.trim()
    if (!q) {
      setNotice(t("match.hint_search"))
      return
    }
    if (!extended) {
      const ok = useFreeSearch()
      if (!ok) {
        setNotice(t("match.error_free_exhausted"))
        return
      }
    }
    setApplied(q)
    setNotice(null)
    setHasSearched(true)
    setLoading(true)
    try {
      const data = await api.get(`/api/search?q=${encodeURIComponent(q)}&game=${encodeURIComponent(game)}`)
      setSearchResults({ players: data.players || [], teams: data.teams || [] })
    } catch (e: any) {
      setNotice(e.message || t("common.error"))
      setSearchResults(null)
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

  const filteredPlayers = useMemo(() => {
    if (!searchResults) return []
    const list = searchResults.players.filter(
      (p) =>
        (game === "all" || p.game === game) &&
        (applied === "" ||
          (p.nick || "").toLowerCase().includes(applied.toLowerCase()) ||
          (p.role || "").toLowerCase().includes(applied.toLowerCase()) ||
          (p.rank || "").toLowerCase().includes(applied.toLowerCase())),
    )
    const sorted = [...list].sort((a, b) => {
      if (sort === "level") return (b.level ?? 0) - (a.level ?? 0)
      if (sort === "time") return (b.hours ?? 0) - (a.hours ?? 0)
      if (sort === "rank") return rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank)
      return (b.vibe ?? 0) - (a.vibe ?? 0)
    })
    return sorted
  }, [searchResults, game, applied, sort])

  const filteredTeams = useMemo(() => {
    if (!searchResults) return []
    return searchResults.teams.filter((t) => game === "all" || t.game === game)
  }, [searchResults, game])

  const noFreeLeft = freeSearchesLeft === 0 && !extended

  return (
    <div className="space-y-4 px-4 py-5">
      <div>
        <h1 className="font-display text-2xl font-bold">{t("match.title")}</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          {t("match.subtitle")}
        </p>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-input bg-card px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) runSearch()
            }}
            placeholder={t("common.search")}
            className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground/60"
          />
        </div>
        <button
          type="button"
          onClick={runSearch}
          disabled={loading}
          className="shrink-0 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground active:scale-95 disabled:opacity-60"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : t("common.search")}
        </button>
      </div>

      {/* Free search counter */}
      {!extended ? (
        <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-3 py-2 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Search className="size-3.5" /> {t("home.free_searches", { count: freeSearchesLeft })}
          </span>
          <span className="font-display text-sm font-bold text-primary">{freeSearchesLeft}/5</span>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-1.5 rounded-2xl border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent">
          <Sparkles className="size-3.5" /> {t("match.extended_active")}
        </div>
      )}

      {/* Paywall */}
      {noFreeLeft && (
        <div className="rounded-3xl border border-stars/40 bg-stars/5 p-4">
          <p className="flex items-center gap-2 font-display text-base font-bold">
            <Lock className="size-4 text-stars" /> {t("match.extended_label")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            {t("match.extended_active")}
          </p>
          <button
            type="button"
            onClick={unlockExtended}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-stars py-3 font-display text-base font-bold text-background active:scale-[0.98]"
          >
            <Star className="size-5 fill-background" /> {t("player_card.unlock_for", { cost: EXTENDED_COST })}
          </button>
        </div>
      )}

      {notice && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
          {notice}
        </p>
      )}

      {/* Mode switch */}
      <div className="flex rounded-2xl border border-border bg-card p-1">
        {(["players", "teams"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors",
              mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            {m === "players" ? t("match.players_tab") : t("match.teams_tab")}
          </button>
        ))}
      </div>

      {/* Game filter chips */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        <Chip active={game === "all"} onClick={() => setGame("all")}>
          {t("guides.filter_all")}
        </Chip>
        {games.map((g) => (
          <Chip key={g.id} active={game === g.id} onClick={() => setGame(g.id)}>
            {g.short}
          </Chip>
        ))}
      </div>

      {/* Sort chips (players only) */}
      {mode === "players" && (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <Zap className="size-3" /> {t("common.search")}:
          </span>
          {(
            [
              { k: "match", l: t("match.sort_match") },
              { k: "level", l: t("common.level") },
              { k: "rank", l: t("profile.rank") },
              { k: "time", l: t("stats.search_time") },
            ] as const
          ).map((s) => (
            <Chip key={s.k} active={sort === s.k} onClick={() => setSort(s.k)}>
              {s.l}
            </Chip>
          ))}
        </div>
      )}

      {/* List */}
      {!hasSearched ? (
        <div className="rounded-3xl border border-dashed border-border py-12 text-center">
          <Search className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-2 font-display text-lg font-bold text-muted-foreground">{t("match.hint_search")}</p>
          <p className="text-sm text-muted-foreground">{t("match.subtitle")}</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : mode === "players" ? (
        <div className="space-y-4">
          {filteredPlayers.length === 0 && <Empty />}
          {filteredPlayers.map((p, i) => {
            const isLocked = !!p.locked && !unlockedPlayers.includes(p.id)
            return (
              <PlayerCard
                key={p.id}
                player={p}
                onConnect={onConnect}
                onChat={onChat}
                onUnlock={async (pl) => {
                  const ok = await unlockPlayer(pl.id, pl.unlockStars ?? 0)
                  if (!ok) setNotice(t("match.error_not_enough_stars"))
                }}
                locked={isLocked}
                index={i}
              />
            )
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTeams.length === 0 && <Empty />}
          {filteredTeams.map((t, i) => (
            <TeamCard key={t.id} team={t} onJoin={onJoinTeam} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors",
        active ? "border-primary bg-primary/15 text-primary" : "border-border bg-card text-muted-foreground",
      )}
    >
      {children}
    </button>
  )
}

function Empty() {
  return (
    <div className="rounded-3xl border border-dashed border-border py-12 text-center">
      <p className="font-display text-lg font-bold">{t("match.no_results_title")}</p>
      <p className="text-sm text-muted-foreground">{t("match.no_results_hint")}</p>
    </div>
  )
}
