"use client"

import { useEffect, useMemo, useState } from "react"
import { Search, Star } from "lucide-react"
import { api, type GamesResponse, type MeResponse, type MatchResult } from "@/lib/api"
import { PlayerCard } from "./player-card"
import type { TabId } from "./bottom-nav"

export function MatchTab({
  games,
  me,
  onConnect,
  onGo,
  onRefreshMe,
}: {
  games: GamesResponse
  me: MeResponse | null
  onConnect: (p: MatchResult) => void
  onGo: (t: TabId) => void
  onRefreshMe: () => void
}) {
  const profile = me?.profile ?? null
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<MatchResult[] | null>(null)
  const [premium, setPremium] = useState(me?.premium ?? false)
  const [loading, setLoading] = useState(false)
  const [buying, setBuying] = useState(false)

  useEffect(() => {
    if (!profile) return
    setLoading(true)
    api
      .search()
      .then((r) => {
        setResults(r.results)
        setPremium(r.premium)
      })
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }, [profile?.game])

  const filtered = useMemo(() => {
    if (!results) return []
    if (!query) return results
    const q = query.toLowerCase()
    return results.filter((p) => p.nickname.toLowerCase().includes(q) || p.role.toLowerCase().includes(q))
  }, [results, query])

  async function buyBestTeam() {
    setBuying(true)
    try {
      const { payWithStars } = await import("@/lib/api")
      await payWithStars({ type: "best_team" }, () => {
        onRefreshMe()
        api.search().then((r) => {
          setResults(r.results)
          setPremium(r.premium)
        })
      })
    } finally {
      setBuying(false)
    }
  }

  if (!profile) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="font-display text-lg font-bold">Сначала заполни анкету</p>
        <p className="mt-1 text-sm text-muted-foreground">Так мы поймём, кого тебе искать</p>
        <button
          type="button"
          onClick={() => onGo("profile")}
          className="mt-4 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
        >
          Заполнить анкету
        </button>
      </div>
    )
  }

  const gameInfo = games.games[profile.game]

  return (
    <div className="space-y-4 px-4 py-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Подбор тиммейтов</h1>
        <p className="text-sm text-muted-foreground">
          По игре {gameInfo?.emoji} {gameInfo?.title} — как в твоей анкете
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-2xl border border-input bg-card px-3">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ник или роль…"
          className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground/60"
        />
      </div>

      {!premium && (
        <div className="rounded-3xl border border-stars/30 bg-stars/10 p-4">
          <p className="font-display text-base font-bold">⭐ Лучший подбор за 5 Stars</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Топ-10 совпадений с открытыми контактами вместо 3 скрытых анкет
          </p>
          <button
            type="button"
            onClick={buyBestTeam}
            disabled={buying}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-stars py-3 text-sm font-bold text-background disabled:opacity-60"
          >
            <Star className="size-4 fill-background" /> {buying ? "Открываем оплату…" : "Купить"}
          </button>
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground">Ищем совпадения…</p>}

      {!loading && filtered.length === 0 && (
        <div className="rounded-3xl border border-dashed border-border py-12 text-center">
          <p className="font-display text-lg font-bold">Никого не нашли 😢</p>
          <p className="text-sm text-muted-foreground">Попробуй позже — анкеты добавляются постоянно</p>
        </div>
      )}

      <div className="space-y-4">
        {filtered.map((p, i) => (
          <PlayerCard key={p.user_id} player={p} game={profile.game} onConnect={onConnect} index={i} />
        ))}
      </div>
    </div>
  )
}
