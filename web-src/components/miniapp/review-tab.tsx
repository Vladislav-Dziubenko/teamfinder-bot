"use client"

import { useCallback, useEffect, useState } from "react"
import { Star, MessageCircleHeart, ThumbsUp, ThumbsDown, Loader2, Lock } from "lucide-react"
import { api } from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { useNexus } from "@/lib/store"
import { cn } from "@/lib/utils"

type Review = {
  id: number
  user_id: number
  rating: number
  text: string
  pros: string
  cons: string
  created_at: string
  nick?: string
}

function Stars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { t } = useI18n()
  return (
    <div className="flex items-center gap-1.5" role="radiogroup" aria-label={t("review.rating")}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={t("review.stars", { count: n })}
          onClick={() => onChange(n)}
          className={cn(
            "transition-all active:scale-90",
            n <= value ? "text-stars drop-shadow-[0_0_6px_var(--stars)]" : "text-muted-foreground/40",
          )}
        >
          <Star className={cn("size-8", n <= value && "fill-stars")} />
        </button>
      ))}
    </div>
  )
}

export function ReviewTab({ onToast }: { onToast: (m: string) => void }) {
  const { t } = useI18n()
  const { role, refresh } = useNexus()
  const isAdmin = role === "admin" || role === "developer"

  const [rating, setRating] = useState(0)
  const [text, setText] = useState("")
  const [pros, setPros] = useState("")
  const [cons, setCons] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [reviews, setReviews] = useState<Review[]>([])
  const [my, setMy] = useState<Review | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (isAdmin) {
        const data = (await api.get("/api/nexus/reviews")) as { reviews: Review[]; my?: Review | null }
        setReviews(data?.reviews ?? [])
        setMy(data?.my ?? null)
      } else {
        const data = (await api.get("/api/nexus/review/my")) as { review: Review | null }
        setMy(data?.review ?? null)
        if (data?.review) {
          setRating(data.review.rating ?? 0)
          setText(data.review.text ?? "")
          setPros(data.review.pros ?? "")
          setCons(data.review.cons ?? "")
        }
      }
    } catch (e) {
      console.error("Failed to load review", e)
    } finally {
      setLoading(false)
    }
  }, [isAdmin])

  useEffect(() => {
    load()
  }, [load])

  async function submit() {
    if (rating < 1) {
      onToast(t("review.need_rating"))
      return
    }
    setSubmitting(true)
    try {
      await api.post("/api/nexus/review", { rating, text, pros, cons })
      setSubmitted(true)
      onToast(t("review.sent"))
      await load()
      await refresh()
    } catch (e: any) {
      onToast(e?.message || t("common.error"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 px-4 py-5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
          <MessageCircleHeart className="size-5" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold">{t("review.title")}</h1>
          <p className="text-sm text-muted-foreground text-pretty">{t("review.subtitle")}</p>
        </div>
      </div>

      {(my || submitted) && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-sm font-semibold text-emerald-400">
          <ThumbsUp className="size-4 shrink-0" /> {t("review.already_submitted")}
        </div>
      )}

      {/* Форма отзыва */}
      <section className="rounded-3xl border border-border bg-card p-4">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">{t("review.rating")}</p>
        <Stars value={rating} onChange={setRating} />

        <label className="mt-4 block text-xs font-semibold text-muted-foreground">{t("review.pros")}</label>
        <input
          value={pros}
          onChange={(e) => setPros(e.target.value)}
          maxLength={200}
          placeholder={t("review.pros_placeholder")}
          className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
        />

        <label className="mt-3 block text-xs font-semibold text-muted-foreground">{t("review.cons")}</label>
        <input
          value={cons}
          onChange={(e) => setCons(e.target.value)}
          maxLength={200}
          placeholder={t("review.cons_placeholder")}
          className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
        />

        <label className="mt-3 block text-xs font-semibold text-muted-foreground">{t("review.text")}</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder={t("review.text_placeholder")}
          className="mt-1 w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
        />

        <button
          type="button"
          disabled={submitting}
          onClick={submit}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground active:scale-[0.98] disabled:opacity-50"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <ThumbsUp className="size-4" />}
          {t("review.submit")}
        </button>
      </section>

      {/* Список отзывов (виден разработчику / админу) */}
      {isAdmin && (
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 font-display text-base font-bold">
            <Lock className="size-4" /> {t("review.manage_title")}
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">{t("review.manage_hint")}</p>
          {loading && <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />}
          <div className="space-y-3">
            {reviews.length === 0 && !loading && (
              <div className="rounded-3xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                {t("review.empty")}
              </div>
            )}
            {reviews.map((r) => (
              <div key={r.id} className="rounded-2xl border border-border bg-card p-3">
                <div className="flex items-center gap-2">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold">
                    {r.nick ? r.nick.slice(0, 1).toUpperCase() : "?"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{r.nick || `ID ${r.user_id}`}</p>
                    <p className="flex items-center gap-0.5 text-[11px]">
                      <Star className="size-3 fill-stars text-stars" /> {r.rating}/5
                    </p>
                  </div>
                </div>
                {r.pros && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-emerald-400">
                    <ThumbsUp className="mt-0.5 size-3.5 shrink-0" /> {r.pros}
                  </p>
                )}
                {r.cons && (
                  <p className="mt-1 flex items-start gap-1.5 text-xs text-destructive">
                    <ThumbsDown className="mt-0.5 size-3.5 shrink-0" /> {r.cons}
                  </p>
                )}
                {r.text && <p className="mt-1.5 text-sm text-muted-foreground text-pretty">{r.text}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}