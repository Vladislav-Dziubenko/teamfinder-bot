"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Star, Coins, Sparkles, X, Package, Clock, Percent, Volume2, VolumeX } from "lucide-react"
import { lootCases, coinShop, rarityMeta, type CaseItem, type LootCase, type Rarity } from "@/lib/data"
import { useNexus } from "@/lib/store"
import { cn } from "@/lib/utils"
import { tick, win as winSfx, whoosh, setMuted, isMuted } from "@/lib/sfx"

const rarityRank: Record<Rarity, number> = { common: 0, rare: 2, epic: 3, premium: 4 }

function formatCooldown(ms: number) {
  const total = Math.ceil(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

// шансы выпадения предметов кейса в процентах
function caseChances(c: LootCase) {
  const totalW = c.items.reduce((s, i) => s + i.weight, 0)
  return c.items.map((i) => ({ item: i, pct: (i.weight / totalW) * 100 }))
}

function pickWeighted(items: CaseItem[]) {
  const total = items.reduce((s, i) => s + i.weight, 0)
  let r = Math.random() * total
  for (const it of items) {
    r -= it.weight
    if (r <= 0) return it
  }
  return items[items.length - 1]
}

function itemPct(c: LootCase, item: CaseItem) {
  const totalW = c.items.reduce((s, i) => s + i.weight, 0)
  return (item.weight / totalW) * 100
}

export function CasesTab({ onToast }: { onToast: (m: string) => void }) {
  const { stars, coins, inventory, caseReadyIn, openCase, sellItem, buyShopItem } = useNexus()
  const [reveal, setReveal] = useState<{ item: CaseItem; box: LootCase } | null>(null)
  const [spin, setSpin] = useState<{ box: LootCase; winner: CaseItem } | null>(null)
  const [sound, setSound] = useState(true)

  useEffect(() => {
    setSound(!isMuted())
  }, [])

  function toggleSound() {
    const next = !sound
    setSound(next)
    setMuted(!next)
  }

  async function handleOpen(c: LootCase) {
    if (spin) return
    if (!c.free && stars < c.costStars) {
      onToast("Недостаточно Telegram Stars")
      return
    }
    const res = await openCase(c.id)
    if (!res.ok) {
      onToast(res.error ?? "Не удалось открыть кейс")
      return
    }
    if (res.item) setSpin({ box: c, winner: res.item })
  }

  async function buyFromShop(key: string, name: string) {
    const res = await buyShopItem(key)
    if (!res.ok) {
      onToast(res.error ?? "Недостаточно монет Nexus")
      return
    }
    onToast(`Куплено: ${name}`)
  }

  return (
    <div className="space-y-6 px-4 py-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Кейсы Nexus</h1>
          <p className="text-sm text-muted-foreground text-pretty">
            Крути рулетку, выбивай скины и премиум. Шансы указаны для каждого кейса.
          </p>
        </div>
        <button
          type="button"
          onClick={toggleSound}
          aria-label={sound ? "Выключить звук" : "Включить звук"}
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-2xl border transition-colors active:scale-90",
            sound ? "border-accent/40 bg-accent/10 text-accent" : "border-border bg-secondary text-muted-foreground",
          )}
        >
          {sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
        </button>
      </div>

      {/* Cases */}
      <div className="space-y-4">
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
                      "grid size-24 place-items-center rounded-2xl border",
                      c.gold ? "border-stars/40 bg-background/40" : "border-accent/30 bg-background/40",
                    )}
                  >
                    <img
                      src={c.image || "/placeholder.svg"}
                      alt={c.name}
                      className={cn("size-20 object-contain transition-transform", isSpin && "animate-float")}
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
                        <Clock className="size-3" /> Доступно через {formatCooldown(cooldown)}
                      </p>
                    ) : (
                      <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-accent">
                        <Sparkles className="size-3" /> Готов к открытию — 1 раз в день
                      </p>
                    )
                  ) : (
                    <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-stars">
                      <Star className="size-3 fill-stars" /> {c.costStars} Stars за открытие
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                disabled={isSpin || (c.free && onCooldown)}
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
                    <Package className="size-5 animate-bounce" /> Крутим…
                  </span>
                ) : c.free ? (
                  onCooldown ? (
                    <span className="flex items-center gap-2 tabular-nums">
                      <Clock className="size-5" /> {formatCooldown(cooldown)}
                    </span>
                  ) : (
                    <>
                      <Package className="size-5" /> Открыть бесплатно
                    </>
                  )
                ) : (
                  <>
                    <Star className="size-5 fill-background" /> Открыть за {c.costStars}
                  </>
                )}
              </button>

              {/* Шансы выпадения */}
              <div className="mt-4 space-y-2 rounded-2xl border border-border bg-background/40 p-3">
                <p className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                  <Percent className="size-3" /> Шансы выпадения
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
          <h2 className="font-display text-lg font-bold">Твой инвентарь</h2>
          <span className="flex items-center gap-1 text-xs font-semibold text-primary">
            <img src="/nexus-coin.png" alt="" className="size-4 rounded-full" /> {coins}
          </span>
        </div>
        {inventory.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border py-8 text-center">
            <Package className="mx-auto size-7 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">Пусто — открой кейс, чтобы что-то выбить</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {inventory.map((item) => (
              <div key={item.uid} className="overflow-hidden rounded-2xl border border-border bg-card p-3">
                <div className="flex items-center gap-2">
                  {item.image ? (
                    <img src={item.image || "/placeholder.svg"} alt="" className="size-10 rounded-lg object-cover" />
                  ) : (
                    <span className="grid size-10 place-items-center rounded-lg bg-secondary text-xl">{item.icon}</span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold">{item.name}</p>
                    <p className="text-[10px]" style={{ color: rarityMeta[item.rarity].color }}>
                      {rarityMeta[item.rarity].label}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await sellItem(item.uid)
                    onToast(`Продано за ${item.sell} монет`)
                  }}
                  className="mt-2.5 flex w-full items-center justify-center gap-1 rounded-xl border border-primary/30 bg-primary/10 py-2 text-xs font-semibold text-primary active:scale-95"
                >
                  <Coins className="size-3.5" /> Продать за {item.sell}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Coin shop */}
      <section>
        <h2 className="mb-3 font-display text-lg font-bold">Магазин за монеты</h2>
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
                onClick={() => buyFromShop(s.key, s.name)}
                className="flex shrink-0 items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground active:scale-95"
              >
                <img src="/nexus-coin.png" alt="" className="size-4 rounded-full" /> {s.price}
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
            setReveal({ item: spin.winner, box: spin.box })
            setSpin(null)
          }}
        />
      )}

      {/* Reveal modal */}
      {reveal && <RevealModal item={reveal.item} box={reveal.box} onClose={() => setReveal(null)} />}
    </div>
  )
}

const CELL = 84
const GAP = 12
const STRIDE = CELL + GAP
const REEL_LEN = 60
const WIN_INDEX = 52
const SPIN_MS = 5600

function CaseSpinner({ box, winner, onDone }: { box: LootCase; winner: CaseItem; onDone: () => void }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [tx, setTx] = useState(0)
  const [go, setGo] = useState(false)
  const [landed, setLanded] = useState(false)
  const doneRef = useRef(false)
  const winColor = rarityMeta[winner.rarity].color

  const reel = useMemo(() => {
    const arr: CaseItem[] = []
    for (let i = 0; i < REEL_LEN; i++) arr.push(i === WIN_INDEX ? winner : pickWeighted(box.items))
    return arr
  }, [box, winner])

  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    const width = vp.clientWidth
    const jitter = (Math.random() - 0.5) * (CELL * 0.5)
    const target = WIN_INDEX * STRIDE + CELL / 2 - width / 2 + jitter

    whoosh()

    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setGo(true)
        setTx(-target)
      })
    })

    // Тики синхронизированы с реальным положением ленты: читаем матрицу трансформа
    // каждый кадр и щёлкаем при каждом пересечении границы ячейки. Тики естественно
    // замедляются вместе с лентой — эффект как в CS:GO.
    let lastCell = 0
    let rafTick = 0
    const track = trackRef.current
    const loop = () => {
      if (track) {
        const m = new DOMMatrixReadOnly(getComputedStyle(track).transform)
        const cell = Math.round(-m.m41 / STRIDE)
        if (cell !== lastCell) {
          lastCell = cell
          tick(0.9 + Math.random() * 0.2)
        }
      }
      if (!doneRef.current) rafTick = requestAnimationFrame(loop)
    }
    rafTick = requestAnimationFrame(loop)

    const fallback = setTimeout(finish, SPIN_MS + 400)
    return () => {
      cancelAnimationFrame(raf)
      cancelAnimationFrame(rafTick)
      clearTimeout(fallback)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function finish() {
    if (doneRef.current) return
    doneRef.current = true
    setLanded(true)
    winSfx(rarityRank[winner.rarity])
    setTimeout(onDone, 620)
  }

  const winPct = itemPct(box, winner)

  return (
    <div className="fixed inset-0 z-[65] flex flex-col items-center justify-center bg-background/90 px-4 backdrop-blur-md">
      {/* атмосферное свечение по цвету редкости */}
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 h-64 -translate-y-1/2 opacity-40 blur-3xl transition-opacity duration-500"
        style={{ background: `radial-gradient(60% 60% at 50% 50%, ${winColor}, transparent 70%)`, opacity: landed ? 0.6 : 0.25 }}
      />

      <div className="relative z-10 flex flex-col items-center w-full">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          <Package className="size-3.5" /> {landed ? "Готово" : "Открываем"}
        </p>
        <p className="mb-4 font-display text-lg font-bold text-balance text-center">{box.name}</p>

        {/* Reel viewport */}
        <div
          ref={viewportRef}
          className="relative w-full max-w-sm overflow-hidden rounded-3xl border bg-card/80 py-4 shadow-2xl transition-colors duration-300"
          style={{ borderColor: landed ? winColor : "var(--border)", boxShadow: landed ? `0 0 40px -6px ${winColor}` : undefined }}
        >
          {/* центральный маркер с подсветкой */}
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
          {/* световой столб под маркером */}
          <div
            className="pointer-events-none absolute inset-y-0 left-1/2 z-[8] w-24 -translate-x-1/2 opacity-60"
            style={{ background: `linear-gradient(90deg, transparent, ${winColor}22 45%, ${winColor}22 55%, transparent)` }}
          />
          {/* мягкие края */}
          <div className="pointer-events-none absolute inset-y-0 left-0 z-[10] w-14 bg-gradient-to-r from-card to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-[10] w-14 bg-gradient-to-l from-card to-transparent" />

          <div
            ref={trackRef}
            className="flex"
            style={{
              gap: `${GAP}px`,
              transform: `translateX(${tx}px)`,
              transition: go ? `transform ${SPIN_MS}ms cubic-bezier(0.08, 0.62, 0.14, 1)` : "none",
              willChange: "transform",
            }}
            onTransitionEnd={finish}
          >
            {reel.map((it, i) => {
              const color = rarityMeta[it.rarity].color
              const isWinCell = landed && i === WIN_INDEX
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

        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Percent className="size-3.5" /> Шанс этого предмета:{" "}
          <span className="font-bold tabular-nums" style={{ color: winColor }}>
            {winPct.toFixed(1)}%
          </span>
        </p>
      </div>
    </div>
  )
}

function RevealModal({ item, box, onClose }: { item: CaseItem; box: LootCase; onClose: () => void }) {
  const meta = rarityMeta[item.rarity]
  const pct = itemPct(box, item)
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/80 px-6 backdrop-blur-sm">
      <div className="animate-star-pop relative w-full max-w-xs overflow-hidden rounded-3xl border border-border bg-card p-6 text-center">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-secondary text-muted-foreground active:scale-90"
          aria-label="Закрыть"
        >
          <X className="size-4" />
        </button>
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: meta.color }}>
          {meta.label}
        </p>
        <div
          className="mx-auto mt-3 grid size-40 place-items-center rounded-3xl border"
          style={{ borderColor: meta.color, boxShadow: `0 0 40px -10px ${meta.color}` }}
        >
          {item.image ? (
            <img src={item.image || "/placeholder.svg"} alt={item.name} className="size-36 object-contain animate-float" />
          ) : (
            <span className="text-6xl">{item.icon}</span>
          )}
        </div>
        <h3 className="mt-4 font-display text-xl font-bold text-balance">{item.name}</h3>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">{item.desc}</p>
        <p className="mt-2 flex items-center justify-center gap-1 text-xs font-semibold" style={{ color: meta.color }}>
          <Percent className="size-3.5" /> Шанс выпадения: {pct.toFixed(1)}%
        </p>
        {item.grantsPremium && (
          <p className="mt-1 flex items-center justify-center gap-1 text-xs font-semibold text-stars">
            <Sparkles className="size-3.5" /> Премиум активирован!
          </p>
        )}
        <div className="mt-3 flex items-center justify-center gap-1 text-xs text-muted-foreground">
          <Coins className="size-3.5" /> Продать можно за {item.sell} монет
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground active:scale-[0.98]"
        >
          Забрать в инвентарь
        </button>
      </div>
    </div>
  )
}
