"use client";

import { useState } from "react";
import { Star, Coins, Sparkles, X, Package } from "lucide-react";
import { lootCases, coinShop, rarityMeta, type CaseItem, type LootCase } from "@/lib/data";
import { useNexus } from "@/lib/store";
import { cn } from "@/lib/utils";

export function CasesTab({ onToast }: { onToast: (m: string) => void }) {
  const { stars, coins, inventory, openedToday, openCase, sellItem, spendCoins, addToInventory } = useNexus();
  const [reveal, setReveal] = useState<CaseItem | null>(null);
  const [spinning, setSpinning] = useState<string | null>(null);

  async function handleOpen(c: LootCase) {
    if (spinning) return;
    // проверка звёзд заранее для золотого
    if (!c.free && stars < c.costStars) {
      onToast("Недостаточно Telegram Stars ⭐");
      return;
    }
    setSpinning(c.id);
    setTimeout(async () => {
      const res = await openCase(c.id);
      setSpinning(null);
      if (!res.ok) {
        onToast(res.error ?? "Не удалось открыть кейс");
        return;
      }
      setReveal(res.item ?? null);
    }, 1400);
  }

  function buyFromShop(key: string, price: number, name: string) {
    const ok = spendCoins(price);
    if (!ok) {
      onToast("Недостаточно монет Nexus");
      return;
    }
    const item = lootCases.flatMap((c) => c.items).find((i) => i.name === name) ?? null;
    if (item) addToInventory(item);
    onToast(`Куплено: ${name}`);
  }

  return (
    <div className="space-y-6 px-4 py-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Кейсы Nexus</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Открывай кейсы, выбивай премиум и скины, продавай их за монеты.
        </p>
      </div>

      {/* Cases */}
      <div className="space-y-4">
        {lootCases.map((c) => {
          const used = openedToday[c.id] ?? 0;
          const left = c.free ? Math.max(0, c.dailyLimit - used) : null;
          const isSpin = spinning === c.id;
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
                    <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-accent">
                      <Sparkles className="size-3" /> Осталось сегодня: {left}/{c.dailyLimit}
                    </p>
                  ) : (
                    <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-stars">
                      <Star className="size-3 fill-stars" /> {c.costStars} Stars за открытие
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                disabled={isSpin || (c.free && left === 0)}
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
                    <Package className="size-5 animate-bounce" /> Открываем…
                  </span>
                ) : c.free ? (
                  left === 0 ? (
                    "Приходи завтра"
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

              {/* Возможный дроп */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {c.items.slice(0, 4).map((i) => (
                  <span
                    key={i.key}
                    className="rounded-full border border-border bg-background/40 px-2 py-0.5 text-[10px] font-medium"
                    style={{ color: rarityMeta[i.rarity].color }}
                  >
                    {i.name}
                  </span>
                ))}
                {c.items.length > 4 && (
                  <span className="rounded-full border border-border bg-background/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                    +{c.items.length - 4}
                  </span>
                )}
              </div>
            </section>
          );
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
                  onClick={() => {
                    sellItem(item.uid);
                    onToast(`Продано за ${item.sell} монет`);
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
                onClick={() => buyFromShop(s.key, s.price, s.name)}
                className="flex shrink-0 items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground active:scale-95"
              >
                <img src="/nexus-coin.png" alt="" className="size-4 rounded-full" /> {s.price}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Reveal modal */}
      {reveal && <RevealModal item={reveal} onClose={() => setReveal(null)} />}
    </div>
  );
}

function RevealModal({ item, onClose }: { item: CaseItem; onClose: () => void }) {
  const meta = rarityMeta[item.rarity];
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
        {item.grantsPremium && (
          <p className="mt-2 flex items-center justify-center gap-1 text-xs font-semibold text-stars">
            <Sparkles className="size-3.5" /> Премиум активирован!
          </p>
        )}
        <div className="mt-4 flex items-center justify-center gap-1 text-xs text-muted-foreground">
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
  );
}
