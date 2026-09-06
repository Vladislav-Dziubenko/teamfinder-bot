"use client"

import { useState } from "react"
import { Package, X } from "lucide-react"
import { rarityMeta, type CaseItem, type LootCase } from "@/lib/data"
import { useI18n } from "@/lib/i18n"
import { useNexus } from "@/lib/store"
import { caseNameKey, itemNameKey } from "../cases-tab"
import { AUTUMN_SHOWCASE_CASES } from "./autumn-event"

function costLabel(c: LootCase, t: (k: string, v?: Record<string, string | number>) => string) {
  if (c.costCoins && c.costCoins > 0) return t("cases.cost_coins", { cost: c.costCoins })
  if (c.costStars > 0) return t("cases.cost_stars", { cost: c.costStars })
  return t("cases.free_ready")
}

function openLabel(c: LootCase, t: (k: string, v?: Record<string, string | number>) => string) {
  if (c.costCoins && c.costCoins > 0) return t("cases.open_coins", { cost: c.costCoins })
  if (c.costStars > 0) return t("cases.open_stars", { cost: c.costStars })
  return t("cases.open_free")
}

export function AutumnCases({
  onToast,
  onGoCases,
}: {
  onToast: (m: string) => void
  onGoCases: () => void
}) {
  const { t, tl } = useI18n()
  const { lootCases, openCase } = useNexus()
  const [reveal, setReveal] = useState<{ item: CaseItem; box: LootCase } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const boxes = AUTUMN_SHOWCASE_CASES.map((id) => lootCases.find((c) => c.id === id)).filter(
    (c): c is LootCase => Boolean(c),
  )

  async function open(box: LootCase) {
    if (busyId) return
    setBusyId(box.id)
    const res = await openCase(box.id)
    setBusyId(null)
    if (!res.ok || !res.item) {
      onToast(res.error ?? t("common.error"))
      return
    }
    setReveal({ item: res.item, box })
  }

  return (
    <div className="space-y-3">
      {boxes.map((box) => (
        <article
          key={box.id}
          className={
            box.gold
              ? "relative overflow-hidden rounded-3xl border border-stars/40 bg-stars/5 p-4"
              : "relative overflow-hidden rounded-3xl border border-primary/30 bg-primary/5 p-4"
          }
        >
          <div className="flex items-center gap-3">
            <img src={box.image} alt="" className="size-16 shrink-0 rounded-2xl object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-base font-bold">
                {tl(caseNameKey(box), box.name)}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {tl(`case.${box.id}.subtitle`, box.subtitle)}
              </p>
              <p className={`mt-0.5 text-[11px] font-semibold ${box.gold ? "text-stars" : "text-primary"}`}>
                {costLabel(box, t)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => open(box)}
            disabled={busyId !== null}
            className={
              box.gold
                ? "mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-stars py-3 font-display text-base font-bold text-background shadow-[0_10px_30px_-8px_var(--stars)] active:scale-[0.98] disabled:opacity-60"
                : "mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 font-display text-base font-bold text-primary-foreground shadow-[0_10px_30px_-8px_var(--primary)] active:scale-[0.98] disabled:opacity-60"
            }
          >
            {busyId === box.id ? (
              <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Package className="size-5" />
            )}
            {openLabel(box, t)}
          </button>
        </article>
      ))}

      <button
        type="button"
        onClick={onGoCases}
        className="w-full rounded-2xl border border-border bg-secondary py-2.5 text-sm font-bold text-muted-foreground active:scale-[0.98]"
      >
        {t("event.open_in_cases")}
      </button>

      {reveal && (
        <div className="fixed inset-0 z-[70] flex flex-col justify-end">
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={() => setReveal(null)}
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
          />
          <div className="relative mx-auto w-full max-w-md rounded-t-3xl border-t border-border bg-card p-5 pb-8 animate-rise">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted-foreground/40" />
            <button
              type="button"
              onClick={() => setReveal(null)}
              className="absolute right-4 top-4 grid size-8 place-items-center rounded-lg text-muted-foreground active:bg-secondary"
              aria-label={t("common.close")}
            >
              <X className="size-4" />
            </button>
            <p className="text-xs font-medium uppercase tracking-widest text-primary">
              {t("event.reveal_title")}
            </p>
            <div className="mt-3 flex items-center gap-3">
              {reveal.item.image ? (
                <img src={reveal.item.image || "/placeholder.svg"} alt="" className="size-16 rounded-2xl object-cover" />
              ) : (
                <span className="grid size-16 place-items-center rounded-2xl bg-secondary text-3xl">
                  {reveal.item.icon}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate font-display text-lg font-bold">
                  {tl(itemNameKey(reveal.item), reveal.item.name)}
                </p>
                <p className="text-xs font-bold" style={{ color: rarityMeta[reveal.item.rarity].color }}>
                  {tl(`rarity.${reveal.item.rarity}`, rarityMeta[reveal.item.rarity].label)}
                </p>
                {reveal.item.sell > 0 && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {t("cases.sell_hint", { cost: reveal.item.sell })}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setReveal(null)}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 font-display text-base font-bold text-primary-foreground active:scale-[0.98]"
            >
              {t("cases.collect")}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
