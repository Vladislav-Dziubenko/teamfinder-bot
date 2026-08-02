"use client"

import { useState } from "react"
import { Star, Check, X, Loader2 } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { useNexus } from "@/lib/store"
import { cn } from "@/lib/utils"

export type StarRecipient = {
  id: number
  nick: string
  avatar: string | null
}

const AMOUNTS = [5, 15, 50]

export function StarSendSheet({
  open,
  onClose,
  fixed,
  list = [],
  onToast,
}: {
  open: boolean
  onClose: () => void
  fixed?: StarRecipient
  list?: StarRecipient[]
  onToast?: (m: string) => void
}) {
  const { t } = useI18n()
  const { stars, transferStars } = useNexus()
  const [amount, setAmount] = useState(15)
  const [picked, setPicked] = useState<StarRecipient | null>(null)
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)

  if (!open) return null

  const target = fixed ?? picked

  async function send() {
    if (!target || sending || done) return
    if (stars < amount) {
      onToast?.(t("donate.insufficient_stars"))
      return
    }
    setSending(true)
    const res = await transferStars(target.id, amount)
    setSending(false)
    if (!res.ok) {
      onToast?.(res.error ?? t("common.error"))
      return
    }
    setDone(true)
    onToast?.(t("donate.sent_to", { count: amount, nick: target.nick }))
    setTimeout(() => {
      setDone(false)
      setPicked(null)
      onClose()
    }, 1200)
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center">
      <button type="button" aria-label={t("common.close")} onClick={onClose} className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
      <div className="relative mx-auto max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border-t border-border bg-card pb-8">
        <div className="sticky top-0 z-10 border-b border-border bg-card">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="font-display text-xl font-bold">{t("donate.send_stars_title")}</h2>
            <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-lg text-muted-foreground active:bg-secondary" aria-label={t("common.close")}>
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="px-5 pt-4">
          <div className="flex items-center justify-between rounded-2xl border border-stars/25 bg-stars/5 px-4 py-3">
            <p className="text-sm text-muted-foreground">{t("donate.your_balance")}</p>
            <p className="flex items-center gap-1 font-display text-base font-bold text-stars">
              <Star className="size-4 fill-stars" /> {stars.toLocaleString("ru")}
            </p>
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("donate.send_amount")}</p>
          <div className="mt-2 flex gap-2">
            {AMOUNTS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setAmount(n)}
                disabled={sending || done}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1 rounded-2xl border py-2.5 text-sm font-semibold active:scale-95 disabled:opacity-50",
                  amount === n
                    ? "border-stars bg-stars/20 text-stars"
                    : "border-border bg-card text-muted-foreground",
                )}
              >
                <Star className="size-3.5 fill-stars" /> {n}
              </button>
            ))}
          </div>

          {!fixed && (
            <>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("donate.send_choose")}</p>
              {list.length === 0 ? (
                <p className="mt-2 rounded-2xl border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                  {t("donate.no_teammates")}
                </p>
              ) : (
                <div className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1">
                  {list.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setPicked(r)}
                      disabled={sending || done}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors active:bg-secondary disabled:opacity-50",
                        picked?.id === r.id ? "border-stars bg-stars/10" : "border-transparent",
                      )}
                    >
                      <img src={r.avatar || "/placeholder.svg"} alt="" className="size-9 rounded-full object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{r.nick}</p>
                      </div>
                      {picked?.id === r.id && <Check className="size-4 shrink-0 text-stars" />}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          <button
            type="button"
            onClick={send}
            disabled={!target || sending || done}
            className={cn(
              "mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-display text-base font-bold transition-all active:scale-[0.98] disabled:opacity-40",
              done ? "bg-accent text-accent-foreground" : "bg-stars text-background",
            )}
          >
            {done ? (
              <span className="flex items-center gap-2 animate-star-pop">
                <Check className="size-5" /> {t("common.done")}
              </span>
            ) : sending ? (
              <span className="flex items-center gap-2">
                <Loader2 className="size-5 animate-spin" /> {t("common.loading")}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Star className="size-5 fill-background" /> {t("donate.send_to", { count: amount })}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
