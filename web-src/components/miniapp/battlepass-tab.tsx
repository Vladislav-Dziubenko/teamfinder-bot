"use client"

import { Crown, Star, Lock, Check, Gift, Clock, Sparkles } from "lucide-react"
import { battlePassTiers, battlePassPriceStars, rarityMeta, type BattlePassReward } from "@/lib/data"
import { useNexus } from "@/lib/store"
import { cn } from "@/lib/utils"

function formatCountdown(ms: number) {
  const total = Math.ceil(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export function BattlePassTab({ onToast }: { onToast: (m: string) => void }) {
  const { bpPremium, bpClaimedCount, bpCanClaim, bpNextClaimIn, buyBattlePass, claimNextBpTier, stars } = useNexus()

  const total = battlePassTiers.length
  const claimed = bpClaimedCount
  const seasonPct = Math.round((claimed / total) * 100)
  const allDone = claimed >= total
  const nextTier = battlePassTiers[claimed] ?? null

  async function buy() {
    if (stars < battlePassPriceStars) {
      onToast("Недостаточно Telegram Stars")
      return
    }
    const ok = await buyBattlePass()
    if (ok) onToast("Премиум-пасс активирован!")
    else onToast("Не удалось купить премиум-пасс")
  }

  async function claim() {
    const res = await claimNextBpTier()
    if (!res.ok) onToast(res.error ?? "Пока нельзя забрать")
    else onToast(`Награда дня ${res.tierLevel} забрана в инвентарь!`)
  }

  return (
    <div className="space-y-6 px-4 py-5">
      {/* Header */}
      <section className="relative overflow-hidden rounded-3xl border border-stars/40 bg-gradient-to-br from-stars/10 to-primary/5 p-5">
        <div className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-stars/20 blur-3xl" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-medium uppercase tracking-widest text-stars">Сезон 1 · 2026</span>
              <h1 className="font-display text-2xl font-bold">Nexus Battle Pass</h1>
            </div>
            <span className="grid size-12 place-items-center rounded-2xl bg-stars/15 font-display text-xl font-bold text-stars">
              {claimed}
            </span>
          </div>

          {/* Season progress */}
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Sparkles className="size-3 text-primary" /> Собрано {claimed} / {total}
              </span>
              <span>{allDone ? "Сезон пройден" : `Осталось ${total - claimed}`}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-stars transition-all"
                style={{ width: `${seasonPct}%` }}
              />
            </div>
          </div>

          {!bpPremium ? (
            <button
              type="button"
              onClick={buy}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-stars py-3.5 font-display text-base font-bold text-background shadow-[0_10px_30px_-8px_var(--stars)] active:scale-[0.98]"
            >
              <Crown className="size-5" /> Купить премиум за {battlePassPriceStars}
              <Star className="size-4 fill-background" />
            </button>
          ) : (
            <p className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-stars/15 py-3 text-sm font-bold text-stars">
              <Crown className="size-4 fill-stars" /> Премиум-пасс активен
            </p>
          )}
        </div>
      </section>

      {/* Daily claim CTA */}
      <section className="rounded-3xl border border-primary/30 bg-card p-4">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Gift className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Награда дня</p>
            <p className="text-[11px] text-muted-foreground text-pretty">
              Открывай по одной ступени каждый день. Возвращайся, чтобы собрать весь сезон.
            </p>
          </div>
        </div>

        {allDone ? (
          <p className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-secondary py-3 text-sm font-bold text-muted-foreground">
            <Check className="size-4" /> Все награды сезона собраны
          </p>
        ) : bpCanClaim ? (
          <button
            type="button"
            onClick={claim}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 font-display text-base font-bold text-primary-foreground shadow-[0_10px_30px_-8px_var(--primary)] active:scale-[0.98]"
          >
            <Gift className="size-5" /> Забрать награду ур. {nextTier?.level}
          </button>
        ) : (
          <p className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-secondary py-3 text-sm font-bold text-muted-foreground tabular-nums">
            <Clock className="size-4" /> Следующая награда через {formatCountdown(bpNextClaimIn)}
          </p>
        )}
      </section>

      {/* Track legend */}
      <div className="flex items-center justify-center gap-4 text-[11px] font-medium text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-secondary" /> Бесплатно
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-stars" /> Премиум
        </span>
      </div>

      {/* Horizontal track */}
      <section>
        <div className="-mx-4 overflow-x-auto no-scrollbar px-4">
          <div className="flex gap-3 pb-2">
            {battlePassTiers.map((t, i) => {
              const state: "claimed" | "current" | "locked" =
                i < claimed ? "claimed" : i === claimed && !allDone ? "current" : "locked"
              return <TierColumn key={t.level} level={t.level} free={t.free} premium={t.premium} bpPremium={bpPremium} state={state} canClaim={bpCanClaim} />
            })}
          </div>
        </div>
      </section>
    </div>
  )
}

function TierColumn({
  level,
  free,
  premium,
  bpPremium,
  state,
  canClaim,
}: {
  level: number
  free: BattlePassReward | null
  premium: BattlePassReward
  bpPremium: boolean
  state: "claimed" | "current" | "locked"
  canClaim: boolean
}) {
  const isCurrent = state === "current"
  return (
    <div
      className={cn(
        "flex w-24 shrink-0 flex-col items-center gap-2 rounded-3xl border p-2.5 transition-colors",
        isCurrent
          ? "border-primary bg-primary/5 shadow-[0_0_0_1px_var(--primary)]"
          : state === "claimed"
            ? "border-border bg-card/60"
            : "border-border bg-card/40",
      )}
    >
      {/* Level badge */}
      <div className="flex items-center gap-1">
        <span
          className={cn(
            "grid size-6 place-items-center rounded-lg font-display text-[11px] font-bold",
            state === "locked" ? "bg-secondary text-muted-foreground" : "bg-primary text-primary-foreground",
          )}
        >
          {level}
        </span>
        {isCurrent && canClaim && <span className="size-1.5 animate-pulse rounded-full bg-primary" />}
      </div>

      {/* Free reward */}
      <RewardChip reward={free} track="free" dim={state === "locked"} claimed={state === "claimed"} />
      {/* Premium reward */}
      <RewardChip
        reward={premium}
        track="premium"
        dim={state === "locked" || !bpPremium}
        claimed={state === "claimed" && bpPremium}
        premiumLocked={!bpPremium}
      />
    </div>
  )
}

function RewardChip({
  reward,
  track,
  dim,
  claimed,
  premiumLocked,
}: {
  reward: BattlePassReward | null
  track: "free" | "premium"
  dim: boolean
  claimed: boolean
  premiumLocked?: boolean
}) {
  const isPremium = track === "premium"

  if (!reward) {
    return (
      <div className="flex h-[4.5rem] w-full items-center justify-center rounded-2xl border border-dashed border-border text-[10px] text-muted-foreground">
        —
      </div>
    )
  }

  return (
    <div
      className={cn(
        "relative flex w-full flex-col items-center gap-1 rounded-2xl border p-1.5 text-center",
        isPremium ? "border-stars/30 bg-stars/5" : "border-border bg-background/40",
        dim && "opacity-45",
      )}
    >
      {isPremium && <Crown className="absolute right-1 top-1 size-3 fill-stars text-stars" />}
      <span className="relative grid size-10 place-items-center rounded-xl bg-background/70">
        {reward.image ? (
          <img src={reward.image || "/placeholder.svg"} alt="" className="size-9 object-contain" />
        ) : (
          <span className="text-xl leading-none">{reward.icon}</span>
        )}
        {claimed && (
          <span className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-2.5" />
          </span>
        )}
        {isPremium && premiumLocked && (
          <span className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full bg-secondary text-muted-foreground">
            <Lock className="size-2.5" />
          </span>
        )}
      </span>
      <p className="line-clamp-2 text-[9px] font-semibold leading-tight text-balance">{reward.name}</p>
      {reward.rarity && (
        <span className="text-[8px] font-bold" style={{ color: rarityMeta[reward.rarity].color }}>
          {rarityMeta[reward.rarity].label}
        </span>
      )}
    </div>
  )
}
