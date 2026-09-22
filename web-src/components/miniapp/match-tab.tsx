"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Search, Sparkles, Star, Lock, Zap, Loader2, Heart, MessageCircle, Radio } from "lucide-react"
import { games } from "@/lib/data"
import type { Player, Team } from "@/lib/data"
import { useI18n } from "@/lib/i18n"
import { useNexus } from "@/lib/store"
import { api } from "@/lib/api"
import { PlayerCard } from "./player-card"
import { TeamCard } from "./team-card"
import { ReviewSheet } from "./review-sheet"
import { cn } from "@/lib/utils"
import { AvatarImage } from "./avatar-image"
import { searchLimit } from "@/lib/search-access"

type SortKey = "match" | "level" | "rank" | "time"

const EXTENDED_COST = 15
let lastOnlineCount = 0

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
  const { loaded, searchUnlimited, dailySearchesBonus, freeSearchesLeft, useFreeSearch, spendStars, unlockPlayer, unlockedPlayers } = useNexus()

  const [mode, setMode] = useState<"players" | "teams" | "likes">("players")
  const [game, setGame] = useState<string>("all")
  const [query, setQuery] = useState("")
  const [applied, setApplied] = useState("")
  const [onlyDiscord, setOnlyDiscord] = useState(false)
  const [onlySteam, setOnlySteam] = useState(false)
  const [sort, setSort] = useState<SortKey>("match")
  const [paidExtended, setExtended] = useState(false)
  const extended = paidExtended || searchUnlimited
  const searchPending = useRef(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<{ players: Player[]; teams: Team[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [reviewPlayer, setReviewPlayer] = useState<Player | null>(null)
  const [onlineCount, setOnlineCount] = useState(lastOnlineCount)
  // Подписка "сообщить, когда появится тиммейт" (пустой поиск).
  const [subs, setSubs] = useState<any[]>([])
  const [subBusy, setSubBusy] = useState(false)

  async function loadSubs() {
    try {
      const data: any = await api.get("/api/search/subscriptions")
      setSubs(Array.isArray(data.subscriptions) ? data.subscriptions : [])
    } catch {}
  }

  useEffect(() => {
    loadSubs()
  }, [])

  const currentSub = useMemo(() => {
    const g = (game || "all").toLowerCase()
    const q = (applied || "").trim().toLowerCase()
    return subs.find(
      (s) =>
        (s.game || "all").toLowerCase() === g &&
        (s.q || "").toLowerCase() === q &&
        Boolean(s.discord_only) === onlyDiscord &&
        Boolean(s.steam_only) === onlySteam,
    ) ?? null
  }, [subs, game, applied, onlyDiscord, onlySteam])

  async function toggleSubscribe() {
    if (subBusy) return
    setSubBusy(true)
    try {
      if (currentSub) {
        await api.delete(`/api/search/subscriptions/${currentSub.id}`)
      } else {
        await api.post("/api/search/subscribe", {
          game: (game || "all").toLowerCase(),
          q: (applied || "").trim(),
          discord_only: onlyDiscord,
          steam_only: onlySteam,
        })
      }
      await loadSubs()
    } catch (e: any) {
      setNotice(e?.message || t("common.error"))
    } finally {
      setSubBusy(false)
    }
  }

  const rankOrder = ["Global Elite", "Legendary Eagle Master", "Legendary Eagle", "Immortal 2", "Ascendant 1", "Divine 3"]

  useEffect(() => {
    let cancelled = false
    async function refreshOnline() {
      try {
        const data: any = await api.get("/api/online")
        if (!cancelled) {
          const count = Number(data.online) || 0
          setOnlineCount(count)
          lastOnlineCount = count
        }
      } catch {}
    }
    void refreshOnline()
    const poll = window.setInterval(refreshOnline, 15_000)
    const onVisible = () => { if (document.visibilityState === "visible") void refreshOnline() }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      cancelled = true
      window.clearInterval(poll)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [])

  async function runSearch() {
    if (!loaded || searchPending.current) return
    const q = query.trim()
    if (!extended && freeSearchesLeft <= 0) {
      setNotice(t("match.error_free_exhausted"))
      return
    }
    searchPending.current = true
    setApplied(q)
    setNotice(null)
    setHasSearched(true)
    setLoading(true)
    try {
      const data = await api.get(`/api/search?q=${encodeURIComponent(q)}&game=${encodeURIComponent(game)}${onlyDiscord ? "&discord=1" : ""}${onlySteam ? "&steam=1" : ""}`)
      setSearchResults({ players: data.players || [], teams: data.teams || [] })
      if (!extended) useFreeSearch()
    } catch (e: any) {
      setNotice(e.message || t("common.error"))
      setSearchResults(null)
    } finally {
      searchPending.current = false
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

  const noFreeLeft = loaded && freeSearchesLeft === 0 && !extended

  return (
    <div className="space-y-4 px-4 py-5">
      <div>
        <h1 className="font-display text-2xl font-bold">{t("match.title")}</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          {t("match.subtitle")}
        </p>
        <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] font-medium tabular-nums text-accent">
          <Radio className="size-3 shrink-0" /> {t("home.hero_players", { count: onlineCount })}
        </span>
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
          disabled={loading || !loaded}
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
          <span className="font-display text-sm font-bold text-primary">{freeSearchesLeft}/{searchLimit(dailySearchesBonus)}</span>
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
        {(["players", "teams", "likes"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors",
              mode === m
                ? m === "likes"
                  ? "bg-rose-500 text-white"
                  : "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted/50",
            )}
          >
            {m === "players" ? t("match.players_tab") : m === "teams" ? t("match.teams_tab") : "❤️ Симпатии"}
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
        <>
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
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
            <Chip active={onlyDiscord} onClick={() => setOnlyDiscord((v) => !v)}>
              🎧 {t("match.only_discord")}
            </Chip>
            <Chip active={onlySteam} onClick={() => setOnlySteam((v) => !v)}>
              🎮 {t("match.only_steam")}
            </Chip>
          </div>
        </>
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
          {filteredPlayers.length === 0 && (
            <>
              <Empty />
              <div className="rounded-3xl border border-primary/30 bg-primary/5 p-4 text-center">
                <p className="text-sm font-semibold">
                  {currentSub ? t("match.notify_on") : t("match.notify_title")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{t("match.notify_hint")}</p>
                <button
                  type="button"
                  disabled={subBusy}
                  onClick={toggleSubscribe}
                  className="mx-auto mt-3 flex items-center gap-1.5 rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-transform active:scale-95 disabled:opacity-50"
                >
                  {subBusy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Radio className="size-4" />
                  )}
                  {currentSub ? t("match.notify_off") : t("match.notify_btn")}
                </button>
              </div>
            </>
          )}
          {filteredPlayers.map((p, i) => {
            const isLocked = !!p.locked && !unlockedPlayers.includes(p.id)
            return (
              <PlayerCard
                key={p.id}
                player={p}
                onConnect={onConnect}
                onChat={onChat}
                onReview={setReviewPlayer}
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
      ) : mode === "likes" ? (
        <LikesSection onChat={onChat} />
      ) : (
        <div className="space-y-4">
          {filteredTeams.length === 0 && <Empty />}
          {filteredTeams.map((t, i) => (
            <TeamCard key={t.id} team={t} onJoin={onJoinTeam} index={i} />
          ))}
        </div>
      )}

      {reviewPlayer && (
        <ReviewSheet
          player={reviewPlayer}
          onClose={() => setReviewPlayer(null)}
          onToast={(m) => setNotice(m)}
        />
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
  children: ReactNode
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
  const { t } = useI18n()
  return (
    <div className="rounded-3xl border border-dashed border-border py-12 text-center">
      <p className="font-display text-lg font-bold">{t("match.no_results_title")}</p>
      <p className="text-sm text-muted-foreground">{t("match.no_results_hint")}</p>
    </div>
  )
}

type LikeProfile = {
  user_id: number
  nick: string
  avatar: string | null
  game: string
  rank: string
  role: string
}

function LikesSection({ onChat }: { onChat?: (p: Player) => void }) {
  const [incoming, setIncoming] = useState<LikeProfile[]>([])
  const [mutual, setMutual] = useState<LikeProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [actingOn, setActingOn] = useState<number | null>(null)

  async function loadLikes() {
    setLoading(true)
    try {
      const data: any = await api.get("/api/profile/likes")
      setIncoming(Array.isArray(data.incoming) ? data.incoming : [])
      setMutual(Array.isArray(data.mutual) ? data.mutual : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadLikes().catch(() => setLoading(false)) }, [])

  async function likeBack(profile: LikeProfile) {
    setActingOn(profile.user_id)
    try {
      const result: any = await api.post("/api/profile/like", { user_id: profile.user_id })
      if (result?.matched) await loadLikes()
    } finally {
      setActingOn(null)
    }
  }

  function playerFrom(profile: LikeProfile): Player {
    return {
      id: String(profile.user_id), nick: profile.nick, realName: profile.nick,
      avatar: profile.avatar ?? "", game: profile.game, rank: profile.rank,
      role: profile.role, kd: 0, winrate: 0, hours: 0, online: false,
      tags: [], bio: "", tgUsername: "", vibe: 0,
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="size-7 animate-spin text-primary" /></div>
  }

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-foreground">Вас оценили</h2>
          {incoming.length > 0 && <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-bold text-rose-500">{incoming.length} новых</span>}
        </div>
        {incoming.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-7 text-center text-sm text-muted-foreground">Пока никто не оценил вашу анкету.</p>
        ) : (
          <div className="space-y-3">
            {incoming.map((profile) => (
              <LikeRow key={profile.user_id} profile={profile} action={
                <button type="button" onClick={() => likeBack(profile)} disabled={actingOn === profile.user_id} className="grid size-10 place-items-center rounded-xl bg-rose-500 text-white active:scale-95 disabled:opacity-60" aria-label="Ответить симпатией">
                  {actingOn === profile.user_id ? <Loader2 className="size-4 animate-spin" /> : <Heart className="size-4" />}
                </button>
              } />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-bold text-foreground">Взаимно 💖</h2>
        {mutual.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-7 text-center text-sm text-muted-foreground">Взаимных симпатий пока нет.</p>
        ) : (
          <div className="space-y-3">
            {mutual.map((profile) => (
              <LikeRow key={profile.user_id} profile={profile} mutual action={
                <button type="button" onClick={() => onChat?.(playerFrom(profile))} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-rose-500 px-3 py-2 text-xs font-bold text-white active:scale-95">
                  <MessageCircle className="size-3.5" /> В чат
                </button>
              } />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function LikeRow({ profile, mutual = false, action }: { profile: LikeProfile; mutual?: boolean; action: ReactNode }) {
  const subtitle = [profile.game, profile.rank].filter(Boolean).join(" · ") || profile.role || "Игрок Nexus"
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-3">
      <div className="relative shrink-0">
        <AvatarImage src={profile.avatar} alt={profile.nick} className="size-12 rounded-xl object-cover" />
        {mutual && <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full bg-rose-500 text-[10px] ring-2 ring-background">❤️</span>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-sm font-bold">{profile.nick}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        <p className="mt-0.5 text-[11px] font-medium text-rose-500">{mutual ? "Взаимная симпатия!" : "Оценил(а) вашу анкету"}</p>
      </div>
      {action}
    </div>
  )
}
