"use client"

import { useState } from "react"
import { Ticket, Gift, Plus, Check, Star, Sparkles, Copy, Users2 } from "lucide-react"
import { useNexus } from "@/lib/store"
import { cn } from "@/lib/utils"

export function PromoTab({ onToast }: { onToast: (m: string) => void }) {
  const { promoCodes, redeemedCodes, redeemPromo, createPromo } = useNexus()
  const [tab, setTab] = useState<"redeem" | "create">("redeem")

  // redeem
  const [code, setCode] = useState("")

  // create
  const [newCode, setNewCode] = useState("")
  const [rCoins, setRCoins] = useState(50)
  const [rStars, setRStars] = useState(0)
  const [rXp, setRXp] = useState(0)
  const [maxUses, setMaxUses] = useState(100)

  const myCodes = promoCodes.filter((c) => c.createdByUser)

  async function handleRedeem() {
    const res = await redeemPromo(code)
    if (!res.ok) {
      onToast(res.error ?? "Не удалось активировать")
      return
    }
    const parts = [
      res.reward?.coins ? `+${res.reward.coins} монет` : null,
      res.reward?.stars ? `+${res.reward.stars} ⭐` : null,
      res.reward?.xp ? `+${res.reward.xp} XP` : null,
    ].filter(Boolean)
    onToast(`Активировано! ${parts.join(", ")}`)
    setCode("")
  }

  async function handleCreate() {
    const res = await createPromo(newCode, { coins: rCoins, stars: rStars, xp: rXp }, maxUses)
    if (!res.ok) {
      onToast(res.error ?? "Не удалось создать")
      return
    }
    onToast(`Промокод ${newCode.toUpperCase()} создан!`)
    setNewCode("")
  }

  function copyCode(c: string) {
    navigator.clipboard?.writeText(c)
    onToast(`Код ${c} скопирован`)
  }

  return (
    <div className="space-y-6 px-4 py-5">
      <div className="text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-3xl bg-primary/15 text-primary animate-float">
          <Ticket className="size-8" />
        </span>
        <h1 className="mt-3 font-display text-2xl font-bold">Промокоды</h1>
        <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground text-pretty">
          Активируй коды за награды или создавай свои и делись с друзьями.
        </p>
      </div>

      {/* Segmented control */}
      <div className="grid grid-cols-2 gap-1 rounded-2xl border border-border bg-card p-1">
        {(["redeem", "create"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-xl py-2.5 text-sm font-semibold transition-all",
              tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            {t === "redeem" ? "Активировать" : "Создать"}
          </button>
        ))}
      </div>

      {tab === "redeem" ? (
        <>
          {/* Redeem box */}
          <section className="rounded-3xl border border-border bg-card p-4">
            <label htmlFor="promo" className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <Gift className="size-4 text-primary" /> Введи промокод
            </label>
            <div className="flex gap-2">
              <input
                id="promo"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) handleRedeem()
                }}
                placeholder="NEXUS2026"
                className="min-w-0 flex-1 rounded-2xl border border-input bg-background px-4 py-3 font-mono text-sm uppercase tracking-wider outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={handleRedeem}
                disabled={!code.trim()}
                className="shrink-0 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground active:scale-95 disabled:opacity-50"
              >
                ОК
              </button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">Подсказка: попробуй код WELCOME 😉</p>
          </section>

          {/* Available codes preview */}
          <section>
            <h2 className="mb-3 font-display text-lg font-bold">Доступные акции</h2>
            <div className="space-y-3">
              {promoCodes
                .filter((c) => !c.createdByUser)
                .map((c) => {
                  const used = redeemedCodes.includes(c.code)
                  return (
                    <div
                      key={c.code}
                      className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
                    >
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                        <Ticket className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-sm font-bold tracking-wide">{c.code}</p>
                        <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          {c.reward.coins > 0 && (
                            <span className="flex items-center gap-0.5">
                              <img src="/nexus-coin.png" alt="" className="size-3 rounded-full" /> {c.reward.coins}
                            </span>
                          )}
                          {c.reward.stars > 0 && (
                            <span className="flex items-center gap-0.5 text-stars">
                              <Star className="size-3 fill-stars" /> {c.reward.stars}
                            </span>
                          )}
                          {c.reward.xp ? <span className="text-accent">+{c.reward.xp} XP</span> : null}
                        </p>
                      </div>
                      {used ? (
                        <span className="flex shrink-0 items-center gap-1 rounded-xl bg-secondary px-3 py-2 text-xs font-semibold text-muted-foreground">
                          <Check className="size-3.5" /> Есть
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setCode(c.code)
                            setTimeout(handleRedeem, 0)
                          }}
                          className="shrink-0 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground active:scale-95"
                        >
                          Забрать
                        </button>
                      )}
                    </div>
                  )
                })}
            </div>
          </section>
        </>
      ) : (
        <>
          {/* Create form */}
          <section className="rounded-3xl border border-border bg-card p-4">
            <h2 className="mb-3 flex items-center gap-2 font-display text-base font-bold">
              <Plus className="size-4 text-primary" /> Новый промокод
            </h2>
            <input
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              placeholder="MYCODE2026"
              maxLength={16}
              className="w-full rounded-2xl border border-input bg-background px-4 py-3 font-mono text-sm uppercase tracking-wider outline-none focus:border-primary"
            />

            <div className="mt-3 grid grid-cols-3 gap-2">
              <NumField label="Монеты" value={rCoins} onChange={setRCoins} step={10} />
              <NumField label="Звёзды" value={rStars} onChange={setRStars} step={5} />
              <NumField label="XP" value={rXp} onChange={setRXp} step={10} />
            </div>

            <div className="mt-3">
              <NumField label="Лимит активаций" value={maxUses} onChange={setMaxUses} step={50} wide />
            </div>

            <button
              type="button"
              onClick={handleCreate}
              disabled={newCode.trim().length < 3}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 font-display text-base font-bold text-primary-foreground active:scale-[0.98] disabled:opacity-50"
            >
              <Sparkles className="size-5" /> Создать промокод
            </button>
          </section>

          {/* My created codes */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
              <Users2 className="size-5 text-accent" /> Мои промокоды
            </h2>
            {myCodes.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border py-8 text-center">
                <Ticket className="mx-auto size-7 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">Ты ещё не создал ни одного кода</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myCodes.map((c) => (
                  <div key={c.code} className="rounded-2xl border border-accent/30 bg-accent/5 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-sm font-bold tracking-wide">{c.code}</p>
                      <button
                        type="button"
                        onClick={() => copyCode(c.code)}
                        className="flex items-center gap-1 rounded-lg border border-border bg-background/40 px-2 py-1 text-[11px] font-semibold active:scale-95"
                      >
                        <Copy className="size-3" /> Копировать
                      </button>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-0.5">
                        <img src="/nexus-coin.png" alt="" className="size-3 rounded-full" /> {c.reward.coins}
                      </span>
                      {c.reward.stars > 0 && (
                        <span className="flex items-center gap-0.5 text-stars">
                          <Star className="size-3 fill-stars" /> {c.reward.stars}
                        </span>
                      )}
                      <span className="ml-auto">
                        {c.uses}/{c.maxUses} активаций
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${Math.min(100, (c.uses / c.maxUses) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function NumField({
  label,
  value,
  onChange,
  step,
  wide,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  step: number
  wide?: boolean
}) {
  return (
    <div className={cn("rounded-2xl border border-border bg-background/40 p-2 text-center", wide && "flex items-center justify-between px-3")}>
      <p className={cn("text-[10px] text-muted-foreground", wide && "text-xs")}>{label}</p>
      <div className={cn("mt-1 flex items-center justify-center gap-2", wide && "mt-0")}>
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - step))}
          className="grid size-6 place-items-center rounded-lg bg-secondary text-sm font-bold active:scale-90"
        >
          −
        </button>
        <span className="min-w-8 font-display text-sm font-bold tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => onChange(value + step)}
          className="grid size-6 place-items-center rounded-lg bg-secondary text-sm font-bold active:scale-90"
        >
          +
        </button>
      </div>
    </div>
  )
}
