"use client"

import { useEffect, useMemo, useState } from "react"
import { Store, Coins, Search, Loader2, X, ShoppingCart, PackageX, Check, Plus, Package } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { useNexus, type InventoryItem } from "@/lib/store"
import { rarityMeta } from "@/lib/data"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { formatNum } from "@/lib/format"
import { itemNameKey } from "./cases-tab"
import { MarketListSheet } from "./market-list-sheet"
import type { Rarity } from "@/lib/data"

type MarketListing = {
  id: number
  seller_id: number
  item_key: string
  item_name: string
  item_rarity: string
  image: string
  icon: string
  price_coins: number
  sell_price: number
  created_at: string
  seller_nick?: string
  seller_avatar?: string | null
  seller_username?: string
  status?: string
  buyer_id?: number | null
  buyer_nick?: string
  sold_at?: string | null
}

const RARITY_FILTERS: Rarity[] = ["common", "rare", "epic", "premium", "legendary"]

export function MarketTab({ onToast }: { onToast: (m: string) => void }) {
  const { t, tl } = useI18n()
  const { coins, refresh, userId, inventory } = useNexus()
  const [mode, setMode] = useState<"feed" | "mine">("feed")
  const [query, setQuery] = useState("")
  const [rarity, setRarity] = useState("")
  const [listings, setListings] = useState<MarketListing[]>([])
  const [mine, setMine] = useState<MarketListing[]>([])
  const [loading, setLoading] = useState(false)
  const [buyingId, setBuyingId] = useState<number | null>(null)
  const [confirm, setConfirm] = useState<MarketListing | null>(null)
  const [cancelId, setCancelId] = useState<number | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [listItem, setListItem] = useState<InventoryItem | null>(null)

  // Стакаем предметы одного типа для пикера выставления.
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
    return Array.from(map.values()).sort((a, b) => (b.item.sell ?? 0) - (a.item.sell ?? 0))
  }, [inventory])

  const loadFeed = async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (query) qs.set("q", query)
      if (rarity) qs.set("rarity", rarity)
      const data: any = await api.get("/api/market/listings?" + qs.toString())
      setListings(data.listings ?? [])
    } catch {
      setListings([])
    } finally {
      setLoading(false)
    }
  }

  const loadMine = async () => {
    setLoading(true)
    try {
      const data: any = await api.get("/api/market/mine")
      setMine(data.listings ?? [])
    } catch {
      setMine([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (mode === "feed") loadFeed()
    else loadMine()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, rarity])

  const debounced = useMemo(() => query, [query])
  useEffect(() => {
    const tm = setTimeout(() => {
      if (mode === "feed") loadFeed()
    }, 350)
    return () => clearTimeout(tm)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  async function buy(l: MarketListing) {
    if (buyingId) return
    setBuyingId(l.id)
    try {
      await api.post("/api/market/buy", { listing_id: l.id })
      onToast(t("market.bought", { item: tl(itemNameKey({ key: l.item_key }), l.item_name) }))
      setListings((prev) => prev.filter((x) => x.id !== l.id))
      await refresh()
    } catch (e: any) {
      const msg = String(e?.message || e || "")
      if (msg.includes("not found")) {
        onToast(t("market.already_sold"))
      } else {
        onToast(t("market.buy_failed"))
      }
    } finally {
      setBuyingId(null)
      setConfirm(null)
    }
  }

  async function cancel(l: MarketListing) {
    setCancelId(l.id)
    try {
      await api.post("/api/market/cancel", { listing_id: l.id })
      onToast(t("market.cancelled"))
      await loadMine()
      await refresh()
    } catch {
      onToast(t("market.cancel_failed"))
    } finally {
      setCancelId(null)
    }
  }

  const feed = listings.filter((l) => l.seller_id !== userId)

  return (
    <div className="space-y-4 px-4 py-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold">
            <Store className="size-6 text-primary" /> {t("market.title")}
          </h1>
          <p className="text-sm text-muted-foreground text-pretty">{t("market.subtitle")}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="flex items-center gap-1 rounded-xl border border-border bg-card px-2.5 py-1.5 text-sm font-bold">
            <img src="/nexus-coin.webp" alt="" className="size-4 rounded-full" /> {formatNum(coins)}
          </span>
          <button
            type="button"
            onClick={() => {
              if (stackedInventory.length === 0) {
                onToast(t("market.no_inventory"))
                return
              }
              setPickerOpen(true)
            }}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition-transform active:scale-95"
          >
            <Plus className="size-3.5" /> {t("market.list_btn")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-2xl border border-border bg-card p-1">
        <button
          type="button"
          onClick={() => setMode("feed")}
          className={cn(
            "rounded-xl px-3 py-2 text-sm font-bold transition-colors",
            mode === "feed" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
          )}
        >
          {t("market.feed_tab")}
        </button>
        <button
          type="button"
          onClick={() => setMode("mine")}
          className={cn(
            "rounded-xl px-3 py-2 text-sm font-bold transition-colors",
            mode === "mine" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
          )}
        >
          {t("market.mine_tab")}
        </button>
      </div>

      {mode === "feed" ? (
        <>
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2.5">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("market.search_placeholder")}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label={t("common.close")} className="text-muted-foreground active:scale-90">
                <X className="size-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setRarity("")}
              className={cn(
                "rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors active:scale-95",
                !rarity ? "bg-primary text-primary-foreground" : "border-border bg-secondary/60 text-muted-foreground",
              )}
            >
              {t("market.all")}
            </button>
            {RARITY_FILTERS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRarity(rarity === r ? "" : r)}
                className={cn(
                  "rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors active:scale-95",
                  rarity === r ? "bg-primary text-primary-foreground" : "border-border bg-secondary/60",
                )}
                style={rarity === r ? {} : { color: rarityMeta[r].color }}
              >
                {tl(`rarity.${r}`, rarityMeta[r].label)}
              </button>
            ))}
          </div>

          {loading && <Loader2 className="mx-auto mt-6 size-6 animate-spin text-muted-foreground" />}

          {!loading && feed.length === 0 && (
            <div className="rounded-3xl border border-dashed border-border py-12 text-center">
              <PackageX className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">{t("market.empty_feed")}</p>
              <button
                type="button"
                onClick={() => {
                  if (stackedInventory.length === 0) {
                    onToast(t("market.no_inventory"))
                    return
                  }
                  setPickerOpen(true)
                }}
                className="mx-auto mt-4 flex items-center gap-1.5 rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground active:scale-95"
              >
                <Plus className="size-4" /> {t("market.list_btn")}
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {feed.map((l) => (
              <div key={l.id} className="overflow-hidden rounded-2xl border border-border bg-card p-3">
                <div className="flex items-center gap-2">
                  {l.image ? (
                    <img src={l.image || "/placeholder.svg"} alt="" className="size-10 rounded-lg object-cover" />
                  ) : (
                    <span className="grid size-10 place-items-center rounded-lg bg-secondary text-xl">{l.icon}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold">{tl(itemNameKey({ key: l.item_key }), l.item_name)}</p>
                    <p className="text-[10px]" style={{ color: rarityMeta[l.item_rarity as Rarity]?.color }}>
                      {tl(`rarity.${l.item_rarity}`, rarityMeta[l.item_rarity as Rarity]?.label ?? "")}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <img src={l.seller_avatar || "/placeholder.svg"} alt="" className="size-5 rounded-full object-cover" />
                  <p className="truncate text-[11px] font-semibold text-muted-foreground">
                    {l.seller_nick || l.seller_username || "User" + l.seller_id}
                  </p>
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 text-sm font-bold">
                    <img src="/nexus-coin.webp" alt="" className="size-4 rounded-full" /> {formatNum(l.price_coins)}
                  </span>
                  <button
                    type="button"
                    disabled={buyingId !== null}
                    onClick={() => setConfirm(l)}
                    className="flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition-transform active:scale-95 disabled:opacity-50"
                  >
                    {buyingId === l.id ? <Loader2 className="size-3.5 animate-spin" /> : <ShoppingCart className="size-3.5" />}
                    {t("market.buy")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          {loading && <Loader2 className="mx-auto mt-6 size-6 animate-spin text-muted-foreground" />}
          {!loading && mine.length === 0 && (
            <div className="rounded-3xl border border-dashed border-border py-12 text-center">
              <PackageX className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">{t("market.empty_mine")}</p>
              <button
                type="button"
                onClick={() => {
                  if (stackedInventory.length === 0) {
                    onToast(t("market.no_inventory"))
                    return
                  }
                  setPickerOpen(true)
                }}
                className="mx-auto mt-4 flex items-center gap-1.5 rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground active:scale-95"
              >
                <Plus className="size-4" /> {t("market.list_btn")}
              </button>
            </div>
          )}
          <div className="space-y-2">
            {mine.map((l) => {
              const active = l.status === "active"
              return (
                <div key={l.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
                  {l.image ? (
                    <img src={l.image || "/placeholder.svg"} alt="" className="size-11 rounded-xl object-cover" />
                  ) : (
                    <span className="grid size-11 place-items-center rounded-xl bg-secondary text-2xl">{l.icon}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{tl(itemNameKey({ key: l.item_key }), l.item_name)}</p>
                    <p className="text-[11px]" style={{ color: rarityMeta[l.item_rarity as Rarity]?.color }}>
                      {tl(`rarity.${l.item_rarity}`, rarityMeta[l.item_rarity as Rarity]?.label ?? "")}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                      {active ? (
                        <>
                          <img src="/nexus-coin.webp" alt="" className="size-3.5 rounded-full" /> {formatNum(l.price_coins)}
                        </>
                      ) : l.status === "sold" ? (
                        <span className="text-emerald-500">
                          <Check className="mr-1 inline size-3" />
                          {t("market.sold_to", { nick: l.buyer_nick || "User" + (l.buyer_id ?? "") })}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{t("market.cancelled")}</span>
                      )}
                    </p>
                  </div>
                  {active && (
                    <button
                      type="button"
                      disabled={cancelId === l.id}
                      onClick={() => cancel(l)}
                      className="flex shrink-0 items-center gap-1 rounded-xl border border-border bg-secondary/60 px-3 py-2 text-xs font-bold text-muted-foreground transition-colors active:scale-95 disabled:opacity-50"
                    >
                      {cancelId === l.id ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
                      {t("market.cancel_btn")}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {confirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/70 p-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-5 shadow-2xl">
            <div className="flex items-center gap-3">
              {confirm.image ? (
                <img src={confirm.image || "/placeholder.svg"} alt="" className="size-12 rounded-xl object-cover" />
              ) : (
                <span className="grid size-12 place-items-center rounded-xl bg-secondary text-2xl">{confirm.icon}</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-base font-bold">{tl(itemNameKey({ key: confirm.item_key }), confirm.item_name)}</p>
                <p className="text-[11px]" style={{ color: rarityMeta[confirm.item_rarity as Rarity]?.color }}>
                  {tl(`rarity.${confirm.item_rarity}`, rarityMeta[confirm.item_rarity as Rarity]?.label ?? "")}
                </p>
              </div>
            </div>
            <p className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-secondary/50 py-3 font-display text-xl font-bold">
              <img src="/nexus-coin.webp" alt="" className="size-5 rounded-full" /> {formatNum(confirm.price_coins)}
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="flex-1 rounded-2xl border border-border bg-secondary/60 py-3 text-sm font-semibold active:scale-[0.98]"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={buyingId !== null}
                onClick={() => buy(confirm)}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground active:scale-[0.98] disabled:opacity-50"
              >
                {buyingId !== null ? <Loader2 className="size-4 animate-spin" /> : <ShoppingCart className="size-4" />}
                {t("market.buy")}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Пикер: какой предмет выставить */}
      {pickerOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-background/70 backdrop-blur-sm sm:items-center sm:p-6" onClick={() => setPickerOpen(false)}>
          <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border bg-card p-5 pb-8 shadow-2xl sm:rounded-3xl sm:pb-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-display text-lg font-bold">
                <Package className="size-5 text-primary" /> {t("market.pick_title")}
              </h3>
              <button type="button" onClick={() => setPickerOpen(false)} aria-label={t("common.close")} className="grid size-8 place-items-center rounded-full text-muted-foreground active:scale-90">
                <X className="size-4" />
              </button>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{t("market.pick_hint")}</p>
            <div className="mt-3 space-y-2">
              {stackedInventory.map(({ item, count, totalSell }) => (
                <button
                  key={item.uid}
                  type="button"
                  onClick={() => {
                    setPickerOpen(false)
                    setListItem(item)
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border bg-secondary/40 p-3 text-left transition-colors active:bg-secondary"
                >
                  {item.image ? (
                    <img src={item.image || "/placeholder.svg"} alt="" className="size-11 rounded-xl object-cover" />
                  ) : (
                    <span className="grid size-11 place-items-center rounded-xl bg-secondary text-2xl">{item.icon}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{tl(itemNameKey(item), item.name)}</p>
                    <p className="text-[10px]" style={{ color: rarityMeta[item.rarity]?.color }}>
                      {tl(`rarity.${item.rarity}`, rarityMeta[item.rarity]?.label ?? "")}
                      {count > 1 ? ` · ×${count}` : ""}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-muted-foreground">
                    <Coins className="size-3.5" /> {formatNum(totalSell)}
                  </span>
                </button>
              ))}
              {stackedInventory.length === 0 && (
                <p className="rounded-xl bg-secondary/50 px-3 py-3 text-center text-xs text-muted-foreground">{t("market.no_inventory")}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Выставление на продажу */}
      {listItem && (
        <MarketListSheet
          item={listItem}
          onClose={() => setListItem(null)}
          onToast={(m) => {
            onToast(m)
            setListItem(null)
            if (mode === "feed") loadFeed()
            else loadMine()
          }}
        />
      )}
    </div>
  )
}
