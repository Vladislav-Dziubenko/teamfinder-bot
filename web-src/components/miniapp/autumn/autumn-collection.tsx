"use client"

import { useMemo, type CSSProperties } from "react"
import { Gem } from "lucide-react"
import { rarityMeta, type Rarity } from "@/lib/data"
import { useI18n } from "@/lib/i18n"
import { useNexus, type InventoryItem } from "@/lib/store"
import { itemNameKey } from "../cases-tab"

// Плитка предмета в духе v0 item-visual: тонированный градиент + свечение глифа.
function tileStyle(rarity: Rarity): CSSProperties {
  const color = rarityMeta[rarity].color
  return {
    borderColor: `color-mix(in oklch, ${color} 45%, transparent)`,
    background: `linear-gradient(145deg, color-mix(in oklch, ${color} 16%, transparent), transparent 70%)`,
  }
}

function tileGlyphStyle(rarity: Rarity): CSSProperties {
  const color = rarityMeta[rarity].color
  return { color, textShadow: `0 0 16px ${color}` }
}

export function AutumnCollection() {
  const { t, tl } = useI18n()
  const { inventory, modelState, lootCases } = useNexus()

  // Стакаем предметы одного типа — как в cases-tab.
  const stacked = useMemo(() => {
    const map = new Map<string, { item: InventoryItem; count: number }>()
    for (const it of inventory) {
      const g = map.get(it.key)
      if (g) g.count++
      else map.set(it.key, { item: it, count: 1 })
    }
    return Array.from(map.values())
  }, [inventory])

  // Легендарки Gold-кейса, которых ещё нет — показываем как "?" (как в v0 Collection).
  const ownedModelIds = useMemo(
    () => new Set(modelState.mine.map((m) => m.model_id).filter(Boolean)),
    [modelState.mine],
  )
  const lockedLegends = useMemo(() => {
    const gold = lootCases.find((c) => c.id === "autumn-gold")
    if (!gold) return []
    return gold.items.filter((i) => i.jackpot && !ownedModelIds.has(i.key))
  }, [lootCases, ownedModelIds])

  return (
    <div className="space-y-4">
      {modelState.mine.length > 0 && (
        <section>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-stars">
            <Gem className="size-3.5" /> {t("event.models_title")}
          </p>
          <div className="space-y-2">
            {modelState.mine.map((m) => (
              <div
                key={`${m.model_id ?? "model"}-${m.token_id}`}
                className="flex items-center gap-3 rounded-2xl border border-stars/40 bg-stars/5 p-3"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-xl">
                  {modelState.meta?.icon ?? "💎"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">
                    {modelState.meta?.name ?? "3D model"} #{m.token_id}
                  </p>
                  <p className="text-[11px] font-bold" style={{ color: rarityMeta.legendary.color }}>
                    {tl("rarity.legendary", rarityMeta.legendary.label)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {lockedLegends.length > 0 && (
        <section>
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-stars">
            {t("event.locked_title")}
          </p>
          <div className="grid grid-cols-3 gap-2.5">
            {lockedLegends.map((item) => (
              <div
                key={item.key}
                className="rounded-2xl border border-stars/35 bg-gradient-to-b from-stars/10 to-transparent p-2.5 text-center"
              >
                <span className="grid min-h-16 place-items-center text-4xl font-black text-stars drop-shadow-[0_0_14px_var(--stars)]">
                  ?
                </span>
                <p className="mt-1 truncate text-[10px] font-bold text-muted-foreground">
                  {t("event.locked_name")}
                </p>
                <p className="text-[9px] text-muted-foreground/70">{t("event.locked_hint")}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <p className="mb-2 text-xs font-medium uppercase tracking-widest text-primary">
          {t("event.collection_title")}
        </p>
        {stacked.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border py-8 text-center">
            <p className="px-4 text-sm text-muted-foreground">{t("event.collection_empty")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {stacked.map(({ item, count }) => (
              <div key={item.key} className="rounded-2xl border border-border bg-card p-3">
                <div className="flex items-center gap-2">
                  {item.image ? (
                    <img src={item.image || "/placeholder.svg"} alt="" className="size-10 rounded-lg object-cover" />
                  ) : (
                    <span
                      className="grid size-10 shrink-0 place-items-center rounded-lg border text-xl font-black"
                      style={{ ...tileStyle(item.rarity) }}
                    >
                      <span style={tileGlyphStyle(item.rarity)}>{item.icon}</span>
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold">{tl(itemNameKey(item), item.name)}</p>
                    <p className="text-[10px]" style={{ color: rarityMeta[item.rarity].color }}>
                      {tl(`rarity.${item.rarity}`, rarityMeta[item.rarity].label)}
                      {count > 1 && <span className="text-muted-foreground"> ×{count}</span>}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
