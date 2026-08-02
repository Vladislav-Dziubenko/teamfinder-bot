"use client"

import { useState } from "react"
import { Star, X, Loader2, Check } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { useNexus } from "@/lib/store"
import { formatNum } from "@/lib/format"
import { cn } from "@/lib/utils"

export function TopUpSheet({
  open,
  need,
  onClose,
  onDone,
  onToast,
}: {
  open: boolean
  need: number
  onClose: () => void
  onDone: () => void
  onToast?: (m: string) => void
}) {
  const { t } = useI18n()
  const { stars, buyStars, buyStarPack, starPacks, refresh } = useNexus()
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (!open) return null

  const amount = Math.max(1, Math.round(need))

  async function pay() {
    if (busy || done) return
    setBusy("exact")
    const res = await buyStars(amount)
    if (!res.ok) {
      setBusy(null)
      onToast?.(res.error ?? t("common.error"))
      return
    }
    await refresh()
    setBusy(null)
    setDone(true)
    onToast?.(t("cases.top_up_done"))
    setTimeout(() => {
      setDone(false)
      onDone()
    }, 900)
  }

  async function buyPack(packId: string, packStars: number) {
    if (busy || done) return
    setBusy(packId)
    const res = await buyStarPack(packId)
    if (!res.ok) {
      setBusy(null)
      onToast?.(res.error ?? t("common.error"))
      return
    }
    await refresh()
    setBusy(null)
    setDone(true)
    onToast?.(t("cases.top_up_done"))
    setTimeout(() => {
      setDone(false)
      onDone()
    }, 900)
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center">
      <button type="button" aria-label={t("common.close")} onClick={onClose} className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
      <div className="relative mx-auto max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border-t border-border bg-card pb-8">
        <div className="sticky top-0 z-10 border-b border-border bg-card">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="font-display text-xl font-bold">{t("cases.need_stars_title")}</h2>
            <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-lg text-muted-foreground active:bg-secondary" aria-label={t("common.close")}>
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="px-5 pt-4">
          <div className="flex items-center justify-between rounded-2xl border border-stars/25 bg-stars/5 px-4 py-3">
            <p className="text-sm text-muted-foreground">{t("cases.need_stars_desc", { cost: formatNum(amount), stars: formatNum(stars) })}</p>
          </div>

          <button
            type="button"
            onClick={pay}
            disabled={busy !== null || done}
            className={cn(
              "mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-display text-base font-bold transition-all active:scale-[0.98] disabled:opacity-40",
              done ? "bg-accent text-accent-foreground" : "bg-stars text-background shadow-[0_10px_30px_-8px_var(--stars)]",
            )}
          >
            {done ? (
              <span className="flex items-center gap-2 animate-star-pop">
                <Check className="size-5" /> {t("common.done")}
              </span>
            ) : busy === "exact" ? (
              <span className="flex items-center gap-2">
                <Loader2 className="size-5 animate-spin" /> {t("common.loading")}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Star className="size-5 fill-background" /> {t("cases.top_up", { cost: formatNum(amount) })}
              </span>
            )}
          </button>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("donate.buy_stars")}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(starPacks.length > 0 ? starPacks : [{ id: "p1", stars: 75, perk: "75 ⭐" }]).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => buyPack(p.id, p.stars)}
                disabled={busy !== null || done}
                className="flex items-center justify-center gap-1.5 rounded-2xl border border-stars/25 bg-stars/10 px-3 py-3 text-sm font-bold text-stars transition-transform active:scale-95 disabled:opacity-40"
              >
                {busy === p.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Star className="size-4 fill-stars" />
                )}
                {formatNum(p.stars)}
              </button>
            ))}
          </div>

          <p className="mt-4 text-center text-[11px] text-muted-foreground">Оплата картой / Telegram Stars</p>
        </div>
      </div>
    </div>
  )
}
