"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { Star, Coins, Sparkles, X, Package, Clock, Percent, Volume2, VolumeX, Loader2, Play, Trophy } from "lucide-react"
import { rarityMeta, type CaseItem, type LootCase, type Rarity } from "@/lib/data"
import { useI18n } from "@/lib/i18n"
import { useNexus, type InventoryItem } from "@/lib/store"
import { cn } from "@/lib/utils"
import { tick, win as winSfx, whoosh, setMuted, isMuted, ensureAudio } from "@/lib/sfx"
import { formatNum } from "@/lib/format"
import { TopUpSheet } from "./top-up-sheet"

const rarityRank: Record<Rarity, number> = { common: 0, rare: 2, epic: 3, premium: 4, legendary: 6 }

const coinShop: { key: string; name: string; desc: string; image: string; price: number }[] = [
  { key: "buy-premium-card", name: "Премиум-анкета", desc: "Максимальный премиум на 1 день: кастом фото/текст, 4 открытия кейсов, приоритет в поиске", image: "/premium-reveal.png", price: 100 },
  { key: "buy-premium-lite", name: "Премиум", desc: "Премиум-статус на 1 день: приоритет в поиске, расширенные анкеты игроков", image: "/premium-card.png", price: 45 },
  { key: "buy-ak47", name: "Скин AK-47", desc: "Коллекционный скин-картинка для профиля", image: "/ak47.png", price: 18 },
  { key: "buy-premium-medium", name: "Премиум средний", desc: "Премиум на 1 день: до 4 открытий кейсов, приоритет в поиске", image: "/premium-x4.png", price: 38 },
]

function formatCooldown(ms: number) {
  const total = Math.ceil(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

function caseChances(c: LootCase) {
  const items = c.items ?? []
  const totalW = items.reduce((s, i) => s + i.weight, 0)
  return items.map((i) => ({ item: i, pct: (i.weight / totalW) * 100 }))
}

function pickWeighted(items: CaseItem[]) {
  const list = items ?? []
  const total = list.reduce((s, i) => s + i.weight, 0)
  let r = Math.random() * total
  for (const it of list) {
    r -= it.weight
    if (r <= 0) return it
  }
  return list[list.length - 1]
}

function itemPct(c: LootCase, item: CaseItem) {
  const items = c.items ?? []
  const totalW = items.reduce((s, i) => s + i.weight, 0)
  return (item.weight / totalW) * 100
}

export function CasesTab({ onToast }: { onToast: (m: string) => void }) {
  const { t } = useI18n()
  const { stars, coins, inventory, pinnedKeys, caseReadyIn, openCase, sellItem, togglePin, buyShopItem, lootCases, refresh, modelState, recordAdWatch, adWatchCount, adRewarded } = useNexus()
  const [reveal, setReveal] = useState<{ item: CaseItem; box: LootCase } | null>(null)
  const [spin, setSpin] = useState<{ box: LootCase; winner: CaseItem | null } | null>(null)
  const [sound, setSound] = useState(true)
  const [sortMode, setSortMode] = useState<"value" | "rarity">("value")
  const [adBusy, setAdBusy] = useState(false)

  // Синхронный мьютекс: React-состояние обновляется асинхронно, поэтому при
  // быстрых кликах гард `if (spin) return` не срабатывает (все клики видят
  // старое состояние). Ref-блокировка ставится синхронно и гасит спам.
  const openBusyRef = useRef(false)

  // Стакаем предметы одного типа: показываем иконку + количество + суммарную ценность.
  const stackedInventory = useMemo(() => {
    const map = new Map<string, { item: InventoryItem; count: number; totalSell: number }>()
    for (const it of inventory) {
      const g = map.get(it.key)
      if (g) {
        g.count++
        g.totalSell += it.sell ?? 0
      } else {
        map.set(it.key, { item: it, count: 1, totalSell: it.sell ?? 0 })
      }
    }
    return Array.from(map.values())
  }, [inventory])

  const sortedStacked = useMemo(() => {
    const arr = [...stackedInventory]
    arr.sort((a, b) => {
      const pa = pinnedKeys.includes(a.item.key) ? 1 : 0
      const pb = pinnedKeys.includes(b.item.key) ? 1 : 0
      if (pa !== pb) return pb - pa
      if (sortMode === "value") {
        return (b.totalSell || 0) - (a.totalSell || 0)
      }
      const rDiff = rarityRank[b.item.rarity] - rarityRank[a.item.rarity]
      if (rDiff !== 0) return rDiff
      return (b.totalSell || 0) - (a.totalSell || 0)
    })
    return arr
  }, [stackedInventory, pinnedKeys, sortMode])

  useEffect(() => {
    setSound(!isMuted())
  }, [])

  function toggleSound() {
    const next = !sound
    setSound(next)
    setMuted(!next)
  }

  // TODO: подключить реальную рекламную сеть (Telegram Rewarded Ads / AdMob).
  // Сейчас это заглушка: эмулирует просмотр рекламы с задержкой, после чего
  // начисляется награда через recordAdWatch. Точка интеграции SDK — здесь.
  async function showRewardedAd(): Promise<boolean> {
    const wa = (typeof window !== "undefined" && window.Telegram?.WebApp) as any
    if (typeof wa?.showRewardedVideo === "function") {
      try {
        return await wa.showRewardedVideo()
      } catch {
        return false
      }
    }
    await new Promise((r) => setTimeout(r, 1200))
    return true
  }

  async function handleOpenForAd(c: LootCase) {
    if (spin || adBusy || openBusyRef.current) return
    openBusyRef.current = true
    setAdBusy(true)
    try {
      const watched = await showRewardedAd()
      if (!watched) {
        onToast(t("cases.ad_not_watched"))
        return
      }
      const ad = await recordAdWatch()
      if (!ad.ok) {
        onToast(ad.error ?? t("common.error"))
        return
      }
      if (ad.reward_stars) {
        onToast(t("cases.ad_reward", { stars: ad.reward_stars }))
      }
      setSpin({ box: c, winner: null })
      const res = await openCase(c.id, 1, undefined, true)
      if (!res.ok) {
        setSpin(null)
        onToast(res.error ?? t("common.error"))
        return
      }
      if (res.item) setSpin((p) => (p ? { box: p.box, winner: res.item! } : p))
    } finally {
      openBusyRef.current = false
      setAdBusy(false)
    }
  }

  async function handleOpen(c: LootCase) {
    if (spin || openBusyRef.current) return
    openBusyRef.current = true
    if (!c.free && stars < c.costStars) {
      openBusyRef.current = false
      setTopUp({ box: c, count: 1, isMulti: false })
      return
    }
    setSpin({ box: c, winner: null })
    const res = await openCase(c.id)
    if (!res.ok) {
      setSpin(null)
      onToast(res.error ?? t("common.error"))
    } else if (res.item) {
      setSpin((p) => (p ? { box: p.box, winner: res.item! } : p))
    }
    openBusyRef.current = false
  }

  const [multi, setMulti] = useState<{ box: LootCase; items: CaseItem[] } | null>(null)
  const [multiBusy, setMultiBusy] = useState<number | null>(null)
  const [topUp, setTopUp] = useState<{ box: LootCase; count: number; isMulti: boolean } | null>(null)
  const handleOpenRef = useRef(handleOpen)
  handleOpenRef.current = handleOpen
  const handleOpenMultiRef = useRef<(c: LootCase, count: number) => void>(() => {})
  handleOpenMultiRef.current = handleOpenMulti

  function handleTopUpDone() {
    const pending = topUp
    setTopUp(null)
    if (!pending) return
    // Принудительно применяем обновление баланса (refresh после оплаты), чтобы
    // повторное открытие читало свежие звёзды, а не устаревшие из замыкания.
    flushSync(() => {})
    if (pending.isMulti) {
      void handleOpenMultiRef.current(pending.box, pending.count)
    } else {
      void handleOpenRef.current(pending.box)
    }
  }

  async function handleOpenMulti(c: LootCase, count: number) {
    if (multi || spin || multiBusy || openBusyRef.current) return
    const totalCost = c.costStars * count
    if (stars < totalCost) {
      setTopUp({ box: c, count, isMulti: true })
      return
    }
    openBusyRef.current = true
    const rid =
      typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `rid-${Date.now()}-${Math.random().toString(36).slice(2)}`
    setMultiBusy(count)
    try {
      let res = await openCase(c.id, count, rid)
      // Обрыв сети/таймаут: один безопасный повтор с тем же ключом — сервер
      // не спишет повторно, если первая попытка уже была обработана.
      if (!res.ok && res.error === "timeout") {
        res = await openCase(c.id, count, rid)
      }
      if (!res.ok) {
        onToast(res.error ?? t("common.error"))
        return
      }
      if (res.items) setMulti({ box: c, items: res.items })
    } finally {
      openBusyRef.current = false
      setMultiBusy(null)
    }
  }

  const [shopBuying, setShopBuying] = useState<string | null>(null)

  async function buyFromShop(key: string, name: string) {
    if (shopBuying) return
    setShopBuying(key)
    const res = await buyShopItem(key)
    setShopBuying(null)
    if (!res.ok) {
      onToast(res.error ?? t("match.error_not_enough_stars"))
      return
    }
    onToast(`${t("common.buy")}: ${name}`)
  }

  return (
    <div className="space-y-6 px-4 py-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">{t("cases.title")}</h1>
          <p className="text-sm text-muted-foreground text-pretty">
            {t("cases.subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={toggleSound}
          aria-label={sound ? t("cases.sound_on") : t("cases.sound_off")}
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-2xl border transition-colors active:scale-90",
            sound ? "border-accent/40 bg-accent/10 text-accent" : "border-border bg-secondary text-muted-foreground",
          )}
        >
          {sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
        </button>
      </div>

      {/* Рекламное достижение: 15 просмотров → +20 ⭐ */}
      {adRewarded === 0 && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
              <Trophy className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold">{t("cases.ad_achievement_title")}</p>
              <p className="text-[11px] text-muted-foreground">{t("cases.ad_achievement_desc", { stars: 20 })}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(100, Math.round((adWatchCount / 15) * 100))}%` }}
                  />
                </div>
                <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
                  {adWatchCount}/15
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cases */}
      <div className="space-y-4">
        {lootCases.length === 0 && (
          <div className="rounded-3xl border border-dashed border-border py-8 text-center">
            <Package className="mx-auto size-7 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">{t("common.error")}</p>
          </div>
        )}
        {lootCases.map((c) => {
          const cooldown = c.free ? caseReadyIn(c.id) : 0
          const onCooldown = cooldown > 0
          const isSpin = spin?.box.id === c.id
          const chances = caseChances(c)
          return (
            <section
              key={c.id}
              className={cn(
                "relative overflow-hidden rounded-3xl border p-4",
                c.gold ? "border-stars/40 bg-stars/5" : "border-accent/30 bg-accent/5",
              )}
            >
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  <div
                    className={cn(
                      "size-24 overflow-hidden rounded-2xl border",
                      c.gold ? "border-stars/40" : "border-accent/30",
                    )}
                  >
                    <img
                      src={c.image || "/placeholder.svg"}
                      alt={c.name}
                      className={cn("size-full object-cover transition-transform", isSpin && "animate-float")}
                    />
                  </div>
                  {c.gold && (
                    <span className="absolute -left-1 -top-1 rounded-lg bg-stars px-1.5 py-0.5 text-[10px] font-bold text-background">
                      GOLD
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-lg font-bold leading-tight text-balance">{c.name}</h2>
                  <p className="text-xs text-muted-foreground">{c.subtitle}</p>
                  {c.free ? (
                    onCooldown ? (
                      <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-muted-foreground tabular-nums">
                        <Clock className="size-3" /> {t("cases.cooldown", { time: formatCooldown(cooldown) })}
                      </p>
                    ) : (
                      <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-accent">
                        <Sparkles className="size-3" /> {t("cases.free_ready")}
                      </p>
                    )
                  ) : (
                    <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-stars">
                      <Star className="size-3 fill-stars" /> {t("cases.cost_stars", { cost: c.costStars })}
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                disabled={isSpin || (c.free && onCooldown && adBusy)}
                onClick={() => handleOpen(c)}
                className={cn(
                  "mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-display text-base font-bold transition-all active:scale-[0.98] disabled:opacity-50",
                  c.gold
                    ? "bg-stars text-background shadow-[0_10px_30px_-8px_var(--stars)]"
                    : "bg-accent text-accent-foreground shadow-[0_10px_30px_-8px_var(--accent)]",
                )}
              >
                {isSpin ? (
                  <span className="flex items-center gap-2">
                    <Package className="size-5 animate-bounce" /> {t("cases.spinning")}
                  </span>
                ) : c.free ? (
                  onCooldown ? (
                    <span className="flex items-center gap-2 tabular-nums">
                      <Clock className="size-5" /> {formatCooldown(cooldown)}
                    </span>
                  ) : (
                    <>
                      <Package className="size-5" /> {t("cases.open_free")}
                    </>
                  )
                ) : (
                  <>
                    <Star className="size-5 fill-background" /> {t("cases.open_stars", { cost: c.costStars })}
                  </>
                )}
              </button>

              {c.free && onCooldown && (
                <button
                  type="button"
                  disabled={isSpin || adBusy}
                  onClick={() => handleOpenForAd(c)}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-primary/40 bg-primary/10 py-2.5 font-display text-sm font-bold text-primary transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {adBusy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <>
                      <Play className="size-4 fill-current" /> {t("cases.open_for_ad")}
                    </>
                  )}
                </button>
              )}

              {!c.free && c.gold && (
                <div className="mt-2">
                  <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">{t("cases.multi_hint")}</p>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[3, 5, 10, 50, 100].map((n) => (
                      <button
                        key={n}
                        type="button"
                        disabled={spin || multi !== null || multiBusy !== null}
                        onClick={() => handleOpenMulti(c, n)}
                        className="flex flex-col items-center justify-center rounded-xl border border-stars/25 bg-stars/5 py-1.5 active:scale-95 disabled:opacity-50"
                      >
                        {multiBusy === n ? (
                          <Loader2 className="size-3.5 animate-spin text-stars" />
                        ) : (
                          <span className="text-xs font-bold text-stars">×{n}</span>
                        )}
                        <span className="text-[9px] tabular-nums text-muted-foreground">
                          {multiBusy === n ? "..." : `${(c.costStars * n).toLocaleString("ru")} ⭐`}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Шансы выпадения */}
              <div className="mt-4 space-y-2 rounded-2xl border border-border bg-background/40 p-3">
              <p className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                <Percent className="size-3" /> {t("cases.drop_chances")}
              </p>
                {chances.map(({ item, pct }) => {
                  const color = rarityMeta[item.rarity].color
                  return (
                    <div key={item.key} className="flex items-center gap-2">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
                      <span className="w-24 shrink-0 truncate text-[11px] font-medium">{item.name}</span>
                      <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                        <span
                          className="absolute inset-y-0 left-0 rounded-full"
                          style={{ width: `${Math.max(4, pct)}%`, background: color }}
                        />
                      </span>
                      <span className="w-10 shrink-0 text-right text-[11px] font-bold tabular-nums" style={{ color }}>
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      {/* Inventory */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">{t("cases.inventory_title")}</h2>
          <span className="flex items-center gap-1 text-xs font-semibold text-primary">
            <img src="/nexus-coin.png" alt="" className="size-4 rounded-full" /> {formatNum(coins)}
          </span>
        </div>
        {inventory.length > 0 && (
          <div className="mb-3 flex items-center gap-1.5">
            {(["value", "rarity"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSortMode(mode)}
                className={cn(
                  "rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors active:scale-95",
                  sortMode === mode ? "bg-primary text-primary-foreground" : "border border-border bg-secondary text-muted-foreground",
                )}
              >
                {mode === "value" ? t("cases.sort_value") : t("cases.sort_rarity")}
              </button>
            ))}
          </div>
        )}
        {modelState.mine.length > 0 && (
          <div className="mb-3 rounded-2xl border border-[#ffd700]/40 bg-[#ffd700]/5 p-3">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#ffd700]/15 text-xl">💎</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">Mini Boss bro</p>
                <p className="text-[11px]" style={{ color: rarityMeta.legendary.color }}>
                  {rarityMeta.legendary.label} · #{modelState.mine[0].token_id}
                </p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-[#ffd700]">Доход: 50-100 ⭐ каждый день · крутить во вкладке «Модель»</p>
          </div>
        )}
        {inventory.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border py-8 text-center">
            <Package className="mx-auto size-7 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">{t("cases.inventory_empty")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {sortedStacked.map(({ item, count, totalSell }) => {
              const pinned = pinnedKeys.includes(item.key)
              return (
                <div
                  key={item.key}
                  className={cn(
                    "overflow-hidden rounded-2xl border bg-card p-3",
                    pinned ? "border-[#ffd700]/60 shadow-[0_0_16px_-6px_rgba(255,215,0,0.6)]" : "border-border",
                  )}
                >
                  <div className="flex items-center gap-2">
                    {item.image ? (
                      <img src={item.image || "/placeholder.svg"} alt="" className="size-10 rounded-lg object-cover" />
                    ) : (
                      <span className="grid size-10 place-items-center rounded-lg bg-secondary text-xl">{item.icon}</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold">{item.name}</p>
                      <p className="text-[10px]" style={{ color: rarityMeta[item.rarity].color }}>
                        {rarityMeta[item.rarity].label} {count > 1 && <span className="text-muted-foreground">×{count}</span>}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => togglePin(item.key)}
                      aria-label={pinned ? t("cases.unpin") : t("cases.pin")}
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-lg text-xs active:scale-90",
                        pinned ? "bg-[#ffd700]/20 text-[#ffd700]" : "bg-secondary text-muted-foreground",
                      )}
                    >
                      📌
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const uid = inventory.find((i) => i.key === item.key)?.uid
                      if (!uid) return
                      await sellItem(uid)
                      onToast(t("cases.sold_for", { cost: item.sell }))
                    }}
                    className="mt-2.5 flex w-full items-center justify-center gap-1 rounded-xl border border-primary/30 bg-primary/10 py-2 text-xs font-semibold text-primary active:scale-95"
                  >
                    <Coins className="size-3.5" /> {t("cases.sell_for", { cost: item.sell })}
                    {count > 1 && <span className="text-[10px] text-muted-foreground">({formatNum(totalSell)} всего)</span>}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Coin shop */}
      <section>
        <h2 className="mb-3 font-display text-lg font-bold">{t("cases.coin_shop_title")}</h2>
        <div className="space-y-3">
          {coinShop.map((s) => (
            <div key={s.key} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
              <img src={s.image || "/placeholder.svg"} alt="" className="size-12 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{s.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{s.desc}</p>
              </div>
              <button
                type="button"
                disabled={!!shopBuying}
                onClick={() => buyFromShop(s.key, s.name)}
                className="flex shrink-0 items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground active:scale-95 disabled:opacity-50"
              >
                {shopBuying === s.key ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <img src="/nexus-coin.png" alt="" className="size-4 rounded-full" />
                )}
                {" "}{formatNum(s.price)}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Spinner overlay */}
      {spin && (
        <CaseSpinner
          box={spin.box}
          winner={spin.winner}
          onDone={() => {
            setReveal({ item: spin.winner!, box: spin.box })
            setSpin(null)
          }}
        />
      )}

      {/* Reveal modal */}
      {reveal && (
        <RevealModal
          item={reveal.item}
          box={reveal.box}
          onClose={() => {
            setReveal(null)
            refresh()
          }}
        />
      )}

      {/* Multi reveal modal */}
      {multi && <MultiRevealModal box={multi.box} items={multi.items} onClose={() => { setMulti(null); refresh() }} />}

      {/* Недостаточно звёзд -> пополнение (оплата картой через Telegram Stars) */}
      {topUp && (
        <TopUpSheet
          open={!!topUp}
          need={topUp.box.costStars * topUp.count}
          onClose={() => setTopUp(null)}
          onDone={handleTopUpDone}
          onToast={onToast}
        />
      )}
    </div>
  )
}

const CELL = 84
const GAP = 12
const STRIDE = CELL + GAP
const REEL_LEN = 60
const REEL_TOTAL = REEL_LEN * STRIDE
const WIN_INDEX = 52
const ACCEL = 0.008
const CRUISE = 3.0
const LAND_MS = 1500

function CaseSpinner({ box, winner, onDone }: { box: LootCase; winner: CaseItem | null; onDone: () => void }) {
  const { t } = useI18n()
  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [landed, setLanded] = useState(false)
  const [landedIndex, setLandedIndex] = useState<number | null>(null)
  const doneRef = useRef(false)
  const landingRef = useRef(false)
  const posRef = useRef(0)
  const velRef = useRef(0)
  const meta = winner ? rarityMeta[winner.rarity] : null
  const winColor = meta?.color ?? "#888"

  const baseReel = useMemo(() => {
    const arr: CaseItem[] = []
    for (let i = 0; i < REEL_LEN; i++) arr.push(pickWeighted(box.items))
    return arr
  }, [box])

  const reel = useMemo<CaseItem[]>(() => {
    const arr: CaseItem[] = []
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < REEL_LEN; i++) arr.push(baseReel[i])
    }
    if (winner) {
      for (let k = 0; k < 3; k++) arr[k * REEL_LEN + WIN_INDEX] = winner
    }
    return arr
  }, [baseReel, winner])

  // Разгон: барабан сразу набирает скорость и крутится, пока сервер не вернул выигрыш.
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      const dt = Math.min(50, now - last)
      last = now
      if (!landingRef.current && !doneRef.current) {
        velRef.current = Math.min(CRUISE, velRef.current + ACCEL * dt)
        posRef.current -= velRef.current * dt
        if (posRef.current < -REEL_TOTAL) posRef.current += REEL_TOTAL
        track.style.transform = `translate3d(${posRef.current}px,0,0)`
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Плавное торможение в выигрышную ячейку, как только известен результат.
  useEffect(() => {
    if (!winner || doneRef.current) return
    const track = trackRef.current
    const vp = viewportRef.current
    if (!track || !vp) return
    landingRef.current = true
    const width = vp.clientWidth
    const jitter = (Math.random() - 0.5) * (CELL * 0.5)
    const start = posRef.current
    const base = WIN_INDEX * STRIDE + CELL / 2 - width / 2 + jitter
    let end = -base
    while (end >= start) end -= REEL_TOTAL
    const d = start - end
    setLandedIndex(Math.round((-end + width / 2 - CELL / 2) / STRIDE))
    const t0 = performance.now()

    ;(async () => { try { await ensureAudio(); whoosh() } catch {} })()

    let lastCell = Math.round(-start / STRIDE)
    let lastTickAt = 0
    let raf = 0
    const easeOut = (p: number) => 1 - Math.pow(1 - p, 4)

    const frame = (now: number) => {
      const p = Math.min(1, (now - t0) / LAND_MS)
      const x = start - d * easeOut(p)
      posRef.current = x
      track.style.transform = `translate3d(${x}px,0,0)`
      const cell = Math.round(-x / STRIDE)
      if (cell !== lastCell) {
        lastCell = cell
        if (now - lastTickAt > 55) {
          lastTickAt = now
          tick(0.9 + Math.random() * 0.2)
        }
      }
      if (p < 1) {
        raf = requestAnimationFrame(frame)
      } else {
        finish()
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winner])

  function finish() {
    if (doneRef.current) return
    doneRef.current = true
    landingRef.current = true
    setLanded(true)
    try {
      if (winner) winSfx(rarityRank[winner.rarity] ?? 0)
    } catch {}
    setTimeout(onDone, 620)
  }

  const winPct = winner ? itemPct(box, winner) : 0

  return (
    <div className="fixed inset-0 z-[65] flex flex-col items-center justify-center bg-background/90 px-4 backdrop-blur-md">
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 h-64 -translate-y-1/2 opacity-40 blur-3xl transition-opacity duration-500"
        style={{ background: `radial-gradient(60% 60% at 50% 50%, ${winColor}, transparent 70%)`, opacity: landed ? 0.6 : 0.25 }}
      />

      <div className="relative z-10 flex flex-col items-center w-full">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          <Package className="size-3.5" /> {landed ? t("common.done") : t("cases.opening")}
        </p>
        <p className="mb-4 font-display text-lg font-bold text-balance text-center">{box.name}</p>

        {/* Reel viewport */}
        <div
          ref={viewportRef}
          className="relative w-full max-w-sm overflow-hidden rounded-3xl border bg-card/80 py-4 shadow-2xl transition-colors duration-300"
          style={{ borderColor: landed ? winColor : "var(--border)", boxShadow: landed ? `0 0 40px -6px ${winColor}` : undefined }}
        >
          <div
            className="pointer-events-none absolute inset-y-2 left-1/2 z-20 w-[3px] -translate-x-1/2 rounded-full"
            style={{ background: winColor, boxShadow: `0 0 14px 2px ${winColor}` }}
          />
          <div
            className="pointer-events-none absolute left-1/2 top-1 z-20 size-0 -translate-x-1/2 border-x-[8px] border-t-[10px] border-x-transparent"
            style={{ borderTopColor: winColor }}
          />
          <div
            className="pointer-events-none absolute bottom-1 left-1/2 z-20 size-0 -translate-x-1/2 border-x-[8px] border-b-[10px] border-x-transparent"
            style={{ borderBottomColor: winColor }}
          />
          <div
            className="pointer-events-none absolute inset-y-0 left-1/2 z-[8] w-24 -translate-x-1/2 opacity-60"
            style={{ background: `linear-gradient(90deg, transparent, ${winColor}22 45%, ${winColor}22 55%, transparent)` }}
          />
          <div className="pointer-events-none absolute inset-y-0 left-0 z-[10] w-14 bg-gradient-to-r from-card to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-[10] w-14 bg-gradient-to-l from-card to-transparent" />

          <div
            ref={trackRef}
            className="flex"
            style={{
              gap: `${GAP}px`,
              willChange: "transform",
            }}
          >
            {reel.map((it, i) => {
              const color = rarityMeta[it.rarity].color
              const isWinCell = landed && i === landedIndex
              return (
                <div
                  key={i}
                  className={cn(
                    "relative flex shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 transition-all duration-300",
                    isWinCell && "scale-105",
                  )}
                  style={{
                    width: CELL,
                    height: CELL + 20,
                    borderColor: color,
                    background: `linear-gradient(180deg, ${color}14, var(--background) 70%)`,
                    boxShadow: isWinCell ? `0 0 24px -2px ${color}, inset 0 0 20px -8px ${color}` : `inset 0 -14px 22px -16px ${color}`,
                  }}
                >
                  {it.image ? (
                    <img src={it.image || "/placeholder.svg"} alt="" className="size-12 object-contain" />
                  ) : (
                    <span className="text-3xl leading-none">{it.icon}</span>
                  )}
                  <span className="h-1 w-9 rounded-full" style={{ background: color }} />
                </div>
              )
            })}
          </div>
        </div>

        {winner && (
          <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Percent className="size-3.5" /> {t("cases.drop_chance_item", { pct: `${winPct.toFixed(1)}%` })}
          </p>
        )}
      </div>

      {landed && winner?.kind === "model" && <JackpotBurst onDone={() => {}} />}
    </div>
  )
}

function RevealModal({ item, box, onClose }: { item: CaseItem; box: LootCase; onClose: () => void }) {
  const { t } = useI18n()
  const meta = rarityMeta[item.rarity]
  const pct = itemPct(box, item)
  const isJackpot = item.kind === "model"
  const isStars = item.kind === "stars"
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/80 px-6 backdrop-blur-sm">
      {isJackpot && <JackpotBurst onDone={() => {}} />}
      <div
        className={cn(
          "animate-star-pop relative w-full max-w-xs overflow-hidden rounded-3xl border bg-card p-6 text-center",
          isJackpot && "border-[#ffd700]/60 shadow-[0_0_60px_-10px_rgba(255,215,0,0.7)]",
        )}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-secondary text-muted-foreground active:scale-90"
          aria-label={t("common.close")}
        >
          <X className="size-4" />
        </button>
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: meta.color }}>
          {meta.label}
        </p>
        <div
          className="mx-auto mt-3 size-40 overflow-hidden rounded-3xl border"
          style={{ borderColor: meta.color, boxShadow: `0 0 40px -10px ${meta.color}` }}
        >
          {item.image ? (
            <img src={item.image || "/placeholder.svg"} alt={item.name} className="size-full object-cover animate-float" />
          ) : (
            <span className="grid size-full place-items-center text-6xl animate-float">{item.icon}</span>
          )}
        </div>
        <h3 className="mt-4 font-display text-xl font-bold text-balance">{item.name}</h3>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">{item.desc}</p>

        {isJackpot && (
          <div className="mt-3 space-y-1.5 rounded-2xl border border-[#ffd700]/40 bg-[#ffd700]/5 p-3 text-left">
            <p className="flex items-center justify-between gap-2 text-sm font-bold text-[#ffd700]">
              <span>💎 Экземпляр</span>
              <span>#{item.token ?? "?"} / 20</span>
            </p>
            <p className="flex items-center justify-between gap-2 text-xs">
              <span>10 000 ⭐</span>
              <span className="font-semibold text-stars">Получено</span>
            </p>
            <p className="flex items-center justify-between gap-2 text-xs">
              <span>Роль</span>
              <span className="font-semibold capitalize">{item.role ?? "модератор"}</span>
            </p>
            <p className="flex items-center justify-between gap-2 text-xs">
              <span>Премиум</span>
              <span className="font-semibold text-accent">Пожизненно</span>
            </p>
            <p className="flex items-center justify-between gap-2 text-xs">
              <span>Доход</span>
              <span className="font-semibold">50-100 ⭐ в день</span>
            </p>
          </div>
        )}

        {isStars && (
          <p className="mt-2 flex items-center justify-center gap-1 text-sm font-bold text-stars">
            <Star className="size-4 fill-stars" /> +{formatNum(item.stars)} {t("cases.stars_added")}
          </p>
        )}

        <p className="mt-2 flex items-center justify-center gap-1 text-xs font-semibold" style={{ color: meta.color }}>
          <Percent className="size-3.5" /> {t("cases.drop_chance_item", { pct: `${pct.toFixed(1)}%` })}
        </p>
        {item.grantsPremium && (
          <p className="mt-1 flex items-center justify-center gap-1 text-xs font-semibold text-stars">
            <Sparkles className="size-3.5" /> {t("cases.premium_activated")}
          </p>
        )}
        {!isStars && !isJackpot && (
          <div className="mt-3 flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <Coins className="size-3.5" /> {t("cases.sell_hint", { cost: item.sell })}
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          className={cn(
            "mt-4 w-full rounded-2xl py-3 text-sm font-bold active:scale-[0.98]",
            isJackpot ? "bg-[#ffd700] text-black shadow-[0_10px_30px_-8px_rgba(255,215,0,0.8)]" : "bg-primary text-primary-foreground",
          )}
        >
          {isJackpot ? t("cases.jackpot_collect") : t("cases.collect")}
        </button>
      </div>
    </div>
  )
}

function MultiRevealModal({ box, items, onClose }: { box: LootCase; items: CaseItem[]; onClose: () => void }) {
  const { t } = useI18n()
  const totalStars = items.filter((i) => i.kind === "stars").reduce((s, i) => s + (i.stars ?? 0), 0)
  const jackpots = items.filter((i) => i.kind === "model")

  const grouped = useMemo(() => {
    const map = new Map<string, { item: CaseItem; count: number }>()
    for (const it of items) {
      const g = map.get(it.key) ?? { item: it, count: 0 }
      g.count++
      map.set(it.key, g)
    }
    return [...map.values()].sort((a, b) => rarityRank[b.item.rarity] - rarityRank[a.item.rarity])
  }, [items])

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/80 px-6 backdrop-blur-sm">
      {jackpots.length > 0 && <JackpotBurst onDone={() => {}} />}
      <div className="animate-star-pop relative flex max-h-[85dvh] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-stars/40 bg-card">
        <div className="flex items-center justify-between border-b border-border bg-stars/5 px-5 py-4">
          <div>
            <h3 className="font-display text-lg font-bold">{t("cases.multi_title", { count: items.length })}</h3>
            <p className="text-xs text-muted-foreground">{box.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-full bg-secondary text-muted-foreground active:scale-90"
            aria-label={t("common.close")}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex gap-2 px-5 py-3">
          <div className="flex flex-1 items-center justify-center gap-1 rounded-2xl border border-stars/25 bg-stars/10 py-2.5 text-sm font-bold text-stars">
            <Star className="size-4 fill-stars" /> +{formatNum(totalStars)}
          </div>
          <div className="flex flex-1 items-center justify-center gap-1 rounded-2xl border border-accent/25 bg-accent/10 py-2.5 text-sm font-bold text-accent">
            <Package className="size-4" /> {items.length - jackpots.length - items.filter((i) => i.kind === "stars").length}
          </div>
        </div>

        {jackpots.length > 0 && (
          <div className="mx-5 mb-1 rounded-2xl border border-[#ffd700]/50 bg-[#ffd700]/10 p-3 text-center">
            <p className="text-sm font-bold text-[#ffd700]">💎 Mini Boss bro #{jackpots[0].token ?? "?"}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">10 000 ⭐ · роль · пожизненный премиум · доход 50-100 ⭐/день</p>
          </div>
        )}

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-5 pb-5">
          {grouped.map(({ item, count }) => {
            const color = rarityMeta[item.rarity].color
            return (
              <div key={item.key} className="flex items-center gap-3 rounded-2xl border border-border bg-background/40 px-3 py-2">
                {item.image ? (
                  <img src={item.image || "/placeholder.svg"} alt="" className="size-9 rounded-lg object-cover" />
                ) : (
                  <span className="grid size-9 place-items-center rounded-lg bg-secondary text-lg">{item.icon}</span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{item.name}</p>
                  <p className="text-[10px]" style={{ color }}>{rarityMeta[item.rarity].label}</p>
                </div>
                <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color }}>×{count}</span>
              </div>
            )
          })}
        </div>

        <div className="border-t border-border p-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground active:scale-[0.98]"
          >
            {t("cases.collect")}
          </button>
        </div>
      </div>
    </div>
  )
}

function JackpotBurst({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const emojis = ["💎", "💰", "⭐", "🤑", "💸", "✨", "🔥", "👑"]
    const spans: HTMLSpanElement[] = []
    for (let i = 0; i < 60; i++) {
      const s = document.createElement("span")
      s.textContent = emojis[Math.floor(Math.random() * emojis.length)]
      s.style.position = "absolute"
      s.style.fontSize = `${18 + Math.random() * 26}px`
      s.style.left = `${Math.random() * 100}%`
      s.style.top = "55%"
      s.style.willChange = "transform, opacity"
      s.style.filter = "drop-shadow(0 0 6px rgba(255,215,0,0.8))"
      el.appendChild(s)
      spans.push(s)
      s.animate(
        [
          { transform: "translate(0,0) scale(0.4)", opacity: 0 },
          {
            transform: `translate(${(Math.random() - 0.5) * 260}px, ${-(60 + Math.random() * 180)}px) scale(1.3)`,
            opacity: 1,
            offset: 0.4,
          },
          {
            transform: `translate(${(Math.random() - 0.5) * 360}px, ${-720 - Math.random() * 220}px) scale(0.8)`,
            opacity: 0,
          },
        ],
        { duration: 1400 + Math.random() * 700, easing: "cubic-bezier(.2,.6,.3,1)", fill: "forwards" },
      )
    }
    const flash = document.createElement("div")
    flash.style.cssText =
      "position:absolute;inset:0;background:radial-gradient(circle,#fff7cc 0%,#ffd700 25%,rgba(255,180,0,0.5) 50%,transparent 72%);opacity:0"
    el.appendChild(flash)
    flash.animate([{ opacity: 0 }, { opacity: 0.95 }, { opacity: 0 }], { duration: 1000, easing: "ease-out" })
    const t = setTimeout(onDone, 2100)
    return () => {
      clearTimeout(t)
      spans.forEach((x) => x.remove())
      flash.remove()
    }
  }, [onDone])

  return <div ref={ref} className="pointer-events-none fixed inset-0 z-[80] overflow-hidden" />
}
