"use client"

import { useState } from "react"
import { Star, Check, Crown, Sparkles, Zap, Trophy, Award } from "lucide-react"
import { starPacks, leaderboard, currentUser } from "@/lib/data"
import type { StarPack } from "@/lib/data"
import { useNexus } from "@/lib/store"
import { cn } from "@/lib/utils"

// Пакеты новой валюты Nexus: сколько монет за сколько звёзд
const coinPacks = [
  { id: "c1", coins: 50, stars: 25 },
  { id: "c2", coins: 120, stars: 50, bonus: "+20%", popular: true },
  { id: "c3", coins: 300, stars: 100, bonus: "+50%" },
]

export function DonateTab() {
  const { spendStars, addCoins } = useNexus()
  const [selected, setSelected] = useState<StarPack | null>(null)
  const [done, setDone] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  function buy() {
    setDone(true)
    setTimeout(() => {
      setDone(false)
      setSelected(null)
    }, 1800)
  }

  function buyCoins(pack: (typeof coinPacks)[number]) {
    const ok = spendStars(pack.stars)
    if (!ok) {
      setFlash("Недостаточно Telegram Stars")
    } else {
      addCoins(pack.coins)
      setFlash(`+${pack.coins} монет Nexus зачислено!`)
    }
    setTimeout(() => setFlash(null), 2000)
  }

  return (
    <div className="space-y-6 px-4 py-5">
      <div className="text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-3xl bg-stars/15 text-stars animate-float">
          <Star className="size-8 fill-stars" />
        </span>
        <h1 className="mt-3 font-display text-2xl font-bold">Поддержи и прокачайся</h1>
        <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground text-pretty">
          Оплата в Telegram Stars ⭐ — буст профиля, PRO-статус и монеты Nexus.
        </p>
      </div>

      {/* Perks row */}
      <div className="grid grid-cols-3 gap-3">
        <Perk icon={Zap} title="Буст" text="Выше в поиске" tint="var(--primary)" />
        <Perk icon={Crown} title="PRO" text="Статус и бейдж" tint="var(--stars)" />
        <Perk icon={Sparkles} title="Кастом" text="Ник и рамка" tint="var(--accent)" />
      </div>

      {/* Buy Nexus coins */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
          <img src="/nexus-coin.png" alt="" className="size-6 rounded-full object-cover" /> Монеты Nexus
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {coinPacks.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => buyCoins(p)}
              className={cn(
                "relative overflow-hidden rounded-2xl border p-3 text-center transition-all active:scale-95",
                p.popular ? "border-primary bg-primary/10" : "border-border bg-card",
              )}
            >
              {p.bonus && (
                <span className="absolute right-0 top-0 rounded-bl-lg bg-accent px-1.5 py-0.5 text-[9px] font-bold text-accent-foreground">
                  {p.bonus}
                </span>
              )}
              <img src="/nexus-coin.png" alt="" className="mx-auto size-8 rounded-full object-cover" />
              <p className="mt-1.5 font-display text-lg font-bold leading-none">{p.coins}</p>
              <p className="mt-1 flex items-center justify-center gap-0.5 text-[11px] font-semibold text-stars">
                <Star className="size-3 fill-stars" /> {p.stars}
              </p>
            </button>
          ))}
        </div>
        {flash && (
          <p className="mt-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-center text-xs font-medium text-accent">
            {flash}
          </p>
        )}
      </section>

      {/* Star packs */}
      <section>
        <h2 className="mb-3 font-display text-lg font-bold">Пакеты Stars</h2>
        <div className="grid grid-cols-2 gap-3">
          {starPacks.map((p) => {
            const isSel = selected?.id === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p)}
                className={cn(
                  "relative overflow-hidden rounded-3xl border p-4 text-left transition-all active:scale-[0.98]",
                  isSel ? "border-stars bg-stars/10" : "border-border bg-card",
                )}
              >
                {p.popular && (
                  <span className="absolute right-0 top-0 rounded-bl-xl bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground">
                    ХИТ
                  </span>
                )}
                <div className="flex items-center gap-1.5">
                  <Star className="size-5 fill-stars text-stars" />
                  <span className="font-display text-2xl font-bold">{p.stars}</span>
                  {p.bonus && (
                    <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent">{p.bonus}</span>
                  )}
                </div>
                <p className="mt-2 text-xs leading-snug text-muted-foreground">{p.perk}</p>
              </button>
            )
          })}
        </div>
      </section>

      {/* Leaderboard */}
      <section>
        <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold">
          <Trophy className="size-5 text-stars" /> Лидерборд
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">Топ по донату Telegram Stars и покупке монет Nexus</p>
        <div className="overflow-hidden rounded-3xl border border-border bg-card">
          {[...leaderboard]
            .sort((a, b) => b.stars - a.stars)
            .map((e, i) => {
              const isYou = e.nick === currentUser.nick
              const medal = i === 0 ? "var(--stars)" : i === 1 ? "var(--accent)" : i === 2 ? "var(--primary)" : undefined
              return (
                <div
                  key={e.id}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3",
                    i === leaderboard.length - 1 ? "" : "border-b border-border",
                    isYou && "bg-primary/5",
                  )}
                >
                  <span
                    className="grid size-7 shrink-0 place-items-center rounded-full font-display text-sm font-bold"
                    style={medal ? { background: medal, color: "var(--background)" } : { background: "var(--secondary)", color: "var(--muted-foreground)" }}
                  >
                    {i + 1}
                  </span>
                  <img src={e.avatar || "/placeholder.svg"} alt="" className="size-9 shrink-0 rounded-xl object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 truncate text-sm font-bold">
                      {e.nick}
                      {isYou && <span className="rounded bg-primary px-1 text-[9px] font-bold text-primary-foreground">ТЫ</span>}
                      {e.premium && <Crown className="size-3 fill-stars text-stars" />}
                    </p>
                    <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-0.5">
                        <img src="/nexus-coin.png" alt="" className="size-3 rounded-full" /> {e.coins.toLocaleString("ru")}
                      </span>
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 font-display text-sm font-bold text-stars">
                    <Star className="size-3.5 fill-stars" /> {e.stars.toLocaleString("ru")}
                  </span>
                </div>
              )
            })}
        </div>
        <p className="mt-2 flex items-center justify-center gap-1 text-center text-[11px] text-muted-foreground">
          <Award className="size-3.5" /> Донать или покупай монеты, чтобы подняться выше
        </p>
      </section>

      {/* Support a player */}
      <div className="rounded-3xl border border-border bg-card p-4">
        <p className="font-display text-base font-bold">Отправить звёзды тиммейту</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Скинь звёзды за красивый клатч или карри — прямо в чат.</p>
        <div className="mt-3 flex gap-2">
          {[5, 15, 50].map((n) => (
            <button
              key={n}
              type="button"
              className="flex flex-1 items-center justify-center gap-1 rounded-2xl border border-stars/30 bg-stars/10 py-2.5 text-sm font-semibold text-stars active:scale-95"
            >
              <Star className="size-3.5 fill-stars" /> {n}
            </button>
          ))}
        </div>
      </div>

      {/* Sticky checkout */}
      {selected && (
        <div className="fixed inset-x-0 bottom-[68px] z-40 mx-auto max-w-md px-4 pb-2 animate-rise">
          <button
            type="button"
            onClick={buy}
            disabled={done}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-display text-base font-bold shadow-[0_10px_30px_-8px_var(--stars)] transition-all active:scale-[0.98]",
              done ? "bg-accent text-accent-foreground" : "bg-stars text-background",
            )}
          >
            {done ? (
              <span className="flex items-center gap-2 animate-star-pop">
                <Check className="size-5" /> Оплачено! +{selected.stars} ⭐
              </span>
            ) : (
              <>
                <Star className="size-5 fill-background" /> Купить за {selected.stars} Stars
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}

function Perk({
  icon: Icon,
  title,
  text,
  tint,
}: {
  icon: typeof Zap
  title: string
  text: string
  tint: string
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 text-center">
      <Icon className="mx-auto size-5" style={{ color: tint }} />
      <p className="mt-1.5 font-display text-sm font-bold">{title}</p>
      <p className="text-[10px] text-muted-foreground">{text}</p>
    </div>
  )
}
