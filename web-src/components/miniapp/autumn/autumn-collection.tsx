"use client"

import { useMemo } from "react"
import { Gem } from "lucide-react"
import { rarityMeta } from "@/lib/data"
import { useI18n } from "@/lib/i18n"
import { useNexus, type InventoryItem } from "@/lib/store"
import { itemNameKey } from "../cases-tab"

export function AutumnCollection() {
  const { t, tl } = useI18n()
  const { inventory, modelState } = useNexus()

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
                key={m.token_id}
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
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-xl">
                      {item.icon}
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
