"use client"

import { useState } from "react"
import { Package, X } from "lucide-react"
import { rarityMeta, type CaseItem, type LootCase } from "@/lib/data"
import { useI18n } from "@/lib/i18n"
import { useNexus } from "@/lib/store"
import { caseNameKey, itemNameKey } from "../cases-tab"
import { AUTUMN_SHOWCASE_CASES } from "./autumn-event"

function costLabel(c: LootCase, t: (k: string, v?: Record<string, string | number>) => string) {
  if (c.id === "autumn-gold") return t("event.gold_key_cost")
  if (c.costCoins && c.costCoins > 0) return t("cases.cost_coins", { cost: c.costCoins })
  if (c.costStars > 0) return t("cases.cost_stars", { cost: c.costStars })
  return t("cases.free_ready")
}

function openLabel(c: LootCase, t: (k: string, v?: Record<string, string | number>) => string) {
  if (c.id === "autumn-gold") return t("event.gold_key_open")
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
  const { lootCases, openCase, inventory } = useNexus()
  const [reveal, setReveal] = useState<{ item: CaseItem; box: LootCase } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const boxes = AUTUMN_SHOWCASE_CASES.map((id) => lootCases.find((c) => c.id === id)).filter(
    (c): c is LootCase => Boolean(c),
  )

  async function open(box: LootCase) {
    if (busyId) return
    if (box.id === "autumn-gold") {
      const have = inventory.filter((i) => i.key === "autumn-key").length
      if (have < 3) {
        onToast(t("cases.need_keys", { have }))
        return
      }
    }
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
              ? "relative overflow-hidden rounded-3xl border border-stars/40 bg-gradient-to-br from-stars/10 to-card p-4"
              : "relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 to-card p-4"
          }
        >
          {/* Верхний ряд: редкость + лимит — как в v0 case-top */}
          <div className="flex items-center justify-between">
            <span
              className="text-[9px] font-bold uppercase tracking-[0.18em]"
              style={{ color: box.gold ? "#ffd700" : "var(--primary)" }}
            >
              {box.gold ? "LEGENDARY" : "EPIC"}
            </span>
            <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
              {box.gold ? "3 KEY" : "LIMITED"}
            </span>
          </div>

          {/* Арт коробки в стиле v0 case-box: свечение + рамка + буква */}
          <div className="relative grid h-36 place-items-center">
            <span
              className="absolute size-28 rounded-full blur-2xl"
              style={{ background: box.gold ? "rgba(245,191,105,.18)" : "color-mix(in oklch, var(--primary) 18%, transparent)" }}
            />
            <div
              className="relative grid h-24 w-32 place-items-center border bg-gradient-to-b from-secondary to-background"
              style={{
                borderColor: box.gold ? "rgba(245,191,105,.7)" : "color-mix(in oklch, var(--primary) 65%, transparent)",
                boxShadow: box.gold
                  ? "0 0 32px rgba(245,191,105,.25), inset 0 0 20px rgba(245,191,105,.1)"
                  : "0 0 32px color-mix(in oklch, var(--primary) 22%, transparent), inset 0 0 20px color-mix(in oklch, var(--primary) 8%, transparent)",
                transform: "perspective(300px) rotateX(8deg)",
              }}
            >
              <span
                className="font-display text-5xl font-black"
                style={{
                  color: "transparent",
                  WebkitTextStroke: box.gold ? "1px #f5bf69" : "1px var(--primary)",
                }}
              >
                {box.gold ? "G" : "A"}
              </span>
              <span
                className="absolute bottom-2 size-2 rotate-45 border"
                style={{ borderColor: box.gold ? "#f5bf69" : "var(--primary)" }}
              />
            </div>
            {box.gold && (
              <span className="absolute right-[22%] top-[16%] animate-bounce text-lg text-stars">✦</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-base font-bold">
                {tl(caseNameKey(box), box.name)}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {tl(`case.${box.id}.subtitle`, box.subtitle)}
              </p>
            </div>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className={`text-[11px] font-semibold ${box.gold ? "text-stars" : "text-primary"}`}>
              {costLabel(box, t)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => open(box)}
            disabled={busyId !== null}
            className={
              box.gold
                ? "mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-stars py-3 font-display text-base font-bold text-background shadow-[0_10px_30px_-8px_var(--stars)] active:scale-[0.98] disabled:opacity-60"
                : "mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 font-display text-base font-bold text-primary-foreground shadow-[0_10px_30px_-8px_var(--primary)] active:scale-[0.98] disabled:opacity-60"
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
            {(reveal.item.jackpot || reveal.item.kind === "model") ? (
              <div>
                {/* Легендарная сцена в духе v0 RevealModal: кольца + лучи + парящий глиф */}
                <div className="relative grid h-52 place-items-center overflow-hidden">
                  <span className="absolute size-40 animate-ping rounded-full border border-stars/60 [animation-duration:1.6s]" />
                  <span className="absolute size-40 rounded-full border border-stars/50" />
                  <span className="absolute h-24 w-64 rotate-[24deg] rounded-full border border-stars/40" />
                  <span className="absolute h-20 w-56 -rotate-[18deg] rounded-full border border-primary/40" />
                  <span
                    className="relative grid size-28 animate-bounce place-items-center overflow-hidden border bg-gradient-to-b from-secondary to-background [animation-duration:1.8s]"
                    style={{
                      borderColor: "rgba(245,191,105,.7)",
                      boxShadow: "0 0 44px rgba(245,191,105,.35), inset 0 0 24px rgba(245,191,105,.12)",
                    }}
                  >
                    {reveal.item.image ? (
                      <img src={reveal.item.image} alt="" className="size-full object-cover" />
                    ) : (
                      <span className="font-display text-6xl font-black text-stars drop-shadow-[0_0_18px_var(--stars)]">
                        {reveal.item.icon}
                      </span>
                    )}
                  </span>
                  <span className="absolute right-[24%] top-[18%] animate-bounce text-xl text-stars">✦</span>
                </div>
                <p className="text-center font-display text-xl font-bold">
                  {tl(itemNameKey(reveal.item), reveal.item.name)}
                </p>
                <p className="mt-0.5 text-center text-xs font-bold" style={{ color: rarityMeta[reveal.item.rarity].color }}>
                  {tl(`rarity.${reveal.item.rarity}`, rarityMeta[reveal.item.rarity].label)}
                </p>
              </div>
            ) : (
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
            )}
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
