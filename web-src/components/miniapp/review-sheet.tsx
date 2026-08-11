"use client"

import { useEffect, useState } from "react"
import { Star, X, Loader2, Send } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { api } from "@/lib/api"
import type { Player } from "@/lib/data"
import { cn } from "@/lib/utils"

function fmtDate(iso: string, lang: string) {
  if (!iso) return ""
  try {
    const d = new Date(iso)
    return d.toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", { day: "numeric", month: "short" })
  } catch {
    return iso
  }
}

type ReviewRow = {
  rating: number
  comment: string
  game: string
  created_at: string
  reviewer_id: number
  reviewer_nick: string
  reviewer_avatar: string
}

function Stars({ value, size = "size-4" }: { value: number; size?: string }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(size, i <= Math.round(value) ? "fill-stars text-stars" : "text-muted-foreground/40")}
        />
      ))}
    </span>
  )
}

export function ReviewSheet({ player, onClose, onToast }: {
  player: Player
  onClose: () => void
  onToast: (m: string) => void
}) {
  const { t, lang } = useI18n()
  const targetId = Number(player.user_id ?? player.id)
  const [data, setData] = useState<{ rating_avg: number | null; rating_count: number; reviews: ReviewRow[]; mine: { rating: number; comment: string } | null } | null>(null)
  const [myRating, setMyRating] = useState(0)
  const [myComment, setMyComment] = useState("")
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      const d = await api.get(`/api/reviews/${targetId}`)
      setData(d)
      setMyRating(d.mine?.rating ?? 0)
      setMyComment(d.mine?.comment ?? "")
    } catch {
      setData({ rating_avg: null, rating_count: 0, reviews: [], mine: null })
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId])

  async function submit() {
    if (myRating < 1) {
      onToast(t("review.need_rating"))
      return
    }
    setSaving(true)
    try {
      await api.post("/api/reviews", { to_user_id: targetId, rating: myRating, comment: myComment })
      onToast(t("review.saved"))
      await load()
    } catch (e: any) {
      onToast(e.message || t("common.error"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border bg-card p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-lg font-bold">
            <Star className="size-5 fill-stars text-stars" />
            {t("review.title")}
          </h3>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="rounded-xl bg-secondary p-2 active:scale-95">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-border bg-secondary/40 p-3">
          <img src={player.avatar || "/placeholder.svg"} alt={player.nick} className="size-12 shrink-0 rounded-2xl object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base font-bold">{player.nick}</p>
            {data ? (
              data.rating_count > 0 ? (
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Stars value={data.rating_avg ?? 0} size="size-3.5" />
                  <span className="font-semibold text-foreground">{data.rating_avg}</span>
                  · {t("review.count", { count: data.rating_count })}
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-muted-foreground">{t("review.no_reviews")}</p>
              )
            ) : (
              <p className="mt-0.5 text-xs text-muted-foreground">{t("review.loading")}</p>
            )}
          </div>
        </div>

        {/* Моя оценка */}
        <div className="mt-4 rounded-2xl border border-border bg-background/40 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("review.my_review")}</p>
          <div className="mt-2 flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <button key={i} type="button" onClick={() => setMyRating(i)} aria-label={`${i}`} className="p-0.5 active:scale-90">
                <Star className={cn("size-7", i <= myRating ? "fill-stars text-stars" : "text-muted-foreground/40")} />
              </button>
            ))}
          </div>
          <input
            value={myComment}
            onChange={(e) => setMyComment(e.target.value)}
            maxLength={500}
            placeholder={t("review.comment_placeholder")}
            className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
          />
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-2.5 text-sm font-bold text-primary-foreground active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {data?.mine ? t("review.update_btn") : t("review.submit_btn")}
          </button>
        </div>

        {/* Отзывы других игроков */}
        <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("review.list_title")}</p>
        {!data ? (
          <p className="mt-1 text-xs text-muted-foreground">{t("review.loading")}</p>
        ) : data.reviews.length === 0 ? (
          <p className="mt-1 rounded-xl bg-secondary/40 px-3 py-2.5 text-center text-xs text-muted-foreground">{t("review.empty_list")}</p>
        ) : (
          <div className="mt-1 space-y-2">
            {data.reviews.map((r, i) => (
              <div key={i} className="rounded-2xl border border-border bg-secondary/30 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <img src={r.reviewer_avatar || "/placeholder.svg"} alt={r.reviewer_nick} className="size-7 shrink-0 rounded-full object-cover" />
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold">{r.reviewer_nick}</span>
                  <Stars value={r.rating} size="size-3" />
                </div>
                {r.comment && <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{r.comment}</p>}
                <p className="mt-1 text-[10px] text-muted-foreground/60">{fmtDate(r.created_at, lang)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
