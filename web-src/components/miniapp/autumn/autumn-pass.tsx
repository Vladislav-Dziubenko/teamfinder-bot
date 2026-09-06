"use client"

import { useState } from "react"
import { Crown, Gift, Check } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { useNexus } from "@/lib/store"

export function AutumnPass({
  onToast,
  onGoPass,
}: {
  onToast: (m: string) => void
  onGoPass: () => void
}) {
  const { t } = useI18n()
  const {
    bpPremium,
    bpClaimedCount,
    bpCanClaim,
    bpCompleted,
    buyBattlePass,
    claimNextBpTier,
    battlePassTiers,
    battlePassPriceStars,
  } = useNexus()
  const [buying, setBuying] = useState(false)
  const [claiming, setClaiming] = useState(false)

  const total = battlePassTiers.length
  const claimed = bpClaimedCount
  const pct = total > 0 ? Math.round((claimed / total) * 100) : 0
  const allDone = bpCompleted || (total > 0 && claimed >= total)
  const nextTier = battlePassTiers[claimed] ?? null

  async function buy() {
    if (buying) return
    setBuying(true)
    const ok = await buyBattlePass()
    setBuying(false)
    onToast(ok ? t("battlepass.bought") : t("battlepass.buy_failed"))
  }

  async function claim() {
    if (claiming) return
    setClaiming(true)
    const res = await claimNextBpTier()
    setClaiming(false)
    if (!res.ok) onToast(res.error ?? t("battlepass.claim_failed"))
    else onToast(t("battlepass.claimed_tier", { level: res.tierLevel ?? 0 }))
  }

  return (
    <section className="relative overflow-hidden rounded-3xl border border-stars/40 bg-gradient-to-br from-stars/10 to-primary/5 p-5">
      <img src="/autumn-pass.webp" alt="" className="-mx-5 -mt-5 mb-4 h-32 w-[calc(100%+2.5rem)] max-w-none object-cover" />
      <div className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-stars/20 blur-3xl" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-medium uppercase tracking-widest text-stars">
              {t("event.tab_pass")}
            </span>
            <h2 className="font-display text-xl font-bold">{t("battlepass.title")}</h2>
          </div>
          <span className="grid size-12 place-items-center rounded-2xl bg-stars/15 font-display text-xl font-bold text-stars">
            {claimed}
          </span>
        </div>

        <p className="mt-3 text-[11px] text-muted-foreground">
          {t("battlepass.collected", { claimed, total })}
        </p>
        <div className="mt-1 h-3 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-stars transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>

        {!bpPremium ? (
          allDone ? (
            <p className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-secondary py-3 text-sm font-bold text-muted-foreground">
              <Check className="size-4" /> {t("event.pass_completed")}
            </p>
          ) : (
          <button
            type="button"
            onClick={buy}
            disabled={buying}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-stars py-3 font-display text-base font-bold text-background shadow-[0_10px_30px_-8px_var(--stars)] active:scale-[0.98] disabled:opacity-60"
          >
            <Crown className="size-5" /> {t("battlepass.buy_premium", { price: battlePassPriceStars })}
          </button>
          )
        ) : bpCanClaim && nextTier ? (
          <button
            type="button"
            onClick={claim}
            disabled={claiming}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 font-display text-base font-bold text-primary-foreground shadow-[0_10px_30px_-8px_var(--primary)] active:scale-[0.98] disabled:opacity-60"
          >
            <Gift className="size-5" /> {t("battlepass.claim_tier", { level: nextTier.level })}
          </button>
        ) : allDone ? (
          <p className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-secondary py-3 text-sm font-bold text-muted-foreground">
            <Check className="size-4" /> {t("event.pass_completed")}
          </p>
        ) : (
          <p className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-stars/15 py-3 text-sm font-bold text-stars">
            <Crown className="size-4" /> {t("battlepass.premium_active")}
          </p>
        )}

        <button
          type="button"
          onClick={onGoPass}
          className="mt-2 w-full rounded-2xl border border-border bg-secondary py-2.5 text-sm font-bold text-muted-foreground active:scale-[0.98]"
        >
          {t("event.pass_open")}
        </button>
      </div>
    </section>
  )
}
