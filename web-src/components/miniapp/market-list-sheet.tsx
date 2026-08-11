"use client"

import { useState } from "react"
import { Store, Loader2, X, Coins } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { useNexus, type InventoryItem } from "@/lib/store"
import { rarityMeta } from "@/lib/data"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { formatNum } from "@/lib/format"
import { itemNameKey } from "./cases-tab"

export function MarketListSheet({
  item,
  onClose,
  onToast,
}: {
  item: InventoryItem | null
  onClose: () => void
  onToast: (m: string) => void
}) {
  const { t, tl } = useI18n()
  const { refresh } = useNexus()
  const [price, setPrice] = useState("")
  const [busy, setBusy] = useState(false)

  if (!item) return null
  const it = item

  const parsed = parseInt(price, 10)
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 1_000_000

  async function submit() {
    if (!valid || busy) return
    setBusy(true)
    try {
      await api.post("/api/market/list", { inventory_id: it.uid, price_coins: parsed })
      onToast(t("market.listed", { item: tl(itemNameKey(it), it.name), price: formatNum(parsed) }))
      await refresh()
      onClose()
    } catch {
      onToast(t("market.list_failed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-background/70 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="w-full max-w-md rounded-t-3xl border border-border bg-card p-5 pb-8 shadow-2xl sm:rounded-3xl sm:pb-5">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-lg font-bold">
            <Store className="size-5 text-primary" /> {t("market.list_title")}
          </h3>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="grid size-8 place-items-center rounded-full text-muted-foreground active:scale-90">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-secondary/40 p-3">
          {it.image ? (
            <img src={it.image || "/placeholder.svg"} alt="" className="size-12 rounded-xl object-cover" />
          ) : (
            <span className="grid size-12 place-items-center rounded-xl bg-secondary text-2xl">{it.icon}</span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{tl(itemNameKey(it), it.name)}</p>
            <p className="text-[11px]" style={{ color: rarityMeta[it.rarity].color }}>
              {tl(`rarity.${it.rarity}`, rarityMeta[it.rarity].label)}
            </p>
          </div>
          <span className="shrink-0 text-[11px] text-muted-foreground">{t("market.sell_base", { cost: it.sell })}</span>
        </div>

        <label className="mt-4 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {t("market.price_label")}
        </label>
        <div className="mt-1.5 flex items-center gap-2 rounded-2xl border border-input bg-background px-4 py-3">
          <Coins className="size-4 shrink-0 text-muted-foreground" />
          <input
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/\D/g, "").slice(0, 7))}
            placeholder="100"
            className="min-w-0 flex-1 bg-transparent font-display text-lg font-bold outline-none placeholder:text-muted-foreground/40"
          />
          <span className="text-xs text-muted-foreground">{t("market.nexus_coins")}</span>
        </div>
        <div className="mt-2 flex gap-1.5">
          {[Math.max(1, it.sell), it.sell * 3, it.sell * 8].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPrice(String(Math.min(p, 1_000_000)))}
              className={cn(
                "rounded-xl border border-border bg-secondary/60 px-3 py-1.5 text-xs font-bold transition-colors active:scale-95",
                parsed === p && "border-primary bg-primary/10 text-primary",
              )}
            >
              {formatNum(p)}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">{t("market.commission_hint")}</p>

        <button
          type="button"
          disabled={!valid || busy}
          onClick={submit}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Store className="size-4" />}
          {t("market.list_btn")}
        </button>
      </div>
    </div>
  )
}
