"use client"

import { useEffect, useState } from "react"
import { X, Loader2, Trophy, Star, Crown } from "lucide-react"
import { api } from "@/lib/api"
import { useNexus } from "@/lib/store"
import { useRankInfo } from "@/lib/stats"
import { cn } from "@/lib/utils"

type LeaderRow = {
  user_id: number
  nick: string
  avatar: string | null
  coins: number
  stars: number
  is_premium: boolean
}

export function LeaderboardSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { userId } = useNexus()
  const rank = useRankInfo()
  const [rows, setRows] = useState<LeaderRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    api.get("/api/leaderboard?limit=50")
      .then((data: any) => setRows(Array.isArray(data.leaderboard) ? data.leaderboard : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [open])

  if (!open) return null

  const isYou = (r: LeaderRow) => r.user_id === userId

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center">
      <button type="button" aria-label="Закрыть" onClick={onClose} className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
      <div className="relative mx-auto max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border-t border-border bg-card pb-8">
        <div className="sticky top-0 z-10 border-b border-border bg-card">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="flex items-center gap-2 font-display text-xl font-bold">
              <Trophy className="size-5 text-stars" /> Полный рейтинг
            </h2>
            <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-lg text-muted-foreground active:bg-secondary" aria-label="Закрыть">
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="px-5 pt-4">
          {rank && (
            <div className="mb-4 flex items-center justify-between rounded-2xl border border-stars/25 bg-stars/5 px-4 py-3">
              <p className="text-sm text-muted-foreground">Твоя позиция</p>
              <p className="flex items-center gap-1.5 font-display text-base font-bold text-stars">
                <Crown className="size-4 fill-stars" />
                #{rank.position} из {rank.total.toLocaleString("ru-RU")}
              </p>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-7 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              Пока никого нет
            </div>
          ) : (
            <div className="overflow-hidden rounded-3xl border border-border bg-card">
              {rows.map((r, i) => {
                const medal = i === 0 ? "var(--stars)" : i === 1 ? "var(--accent)" : i === 2 ? "var(--primary)" : undefined
                const you = isYou(r)
                return (
                  <div
                    key={r.user_id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3",
                      i === rows.length - 1 ? "" : "border-b border-border",
                      you && "bg-primary/5",
                    )}
                  >
                    <span
                      className="grid size-7 shrink-0 place-items-center rounded-full font-display text-sm font-bold"
                      style={medal ? { background: medal, color: "var(--background)" } : { background: "var(--secondary)", color: "var(--muted-foreground)" }}
                    >
                      {i + 1}
                    </span>
                    <img src={r.avatar || "/placeholder.svg"} alt="" className="size-9 shrink-0 rounded-xl object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1 truncate text-sm font-bold">
                        {r.nick}
                        {you && <span className="rounded bg-primary px-1 text-[9px] font-bold text-primary-foreground">ты</span>}
                        {r.is_premium && <Crown className="size-3 fill-stars text-stars" />}
                      </p>
                      <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-0.5">
                          <img src="/nexus-coin.webp" alt="" className="size-3 rounded-full" /> {r.coins.toLocaleString("ru-RU")}
                        </span>
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 font-display text-sm font-bold text-stars">
                      <Star className="size-3.5 fill-stars" /> {r.stars.toLocaleString("ru-RU")}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
