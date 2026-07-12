"use client"

import { useState } from "react"
import { Star, Zap, TrendingUp, BookOpen } from "lucide-react"
import { payWithStars, type MeResponse } from "@/lib/api"

export function DonateTab({
  me,
  onPaid,
  onToast,
}: {
  me: MeResponse | null
  onPaid: () => void
  onToast: (msg: string) => void
}) {
  const [buyingKey, setBuyingKey] = useState<string | null>(null)

  async function buy(type: string, label: string) {
    setBuyingKey(type)
    try {
      await payWithStars({ type }, () => {
        onPaid()
        onToast(`Готово: ${label}`)
      })
    } finally {
      setBuyingKey(null)
    }
  }

  const hasProfile = !!me?.profile

  return (
    <div className="space-y-5 px-4 py-5">
      <div className="text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-3xl bg-stars/15 text-stars animate-float">
          <Star className="size-8 fill-stars" />
        </span>
        <h1 className="mt-3 font-display text-2xl font-bold">Магазин</h1>
        <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground text-pretty">
          Оплата напрямую в Telegram Stars ⭐ — деньги идут разработчику бота, без посредников.
        </p>
      </div>

      <div className="space-y-3">
        <Offer
          icon={Zap}
          title="Лучший подбор команд"
          price="5⭐"
          desc="Топ-10 совпадений с открытыми контактами вместо 3 скрытых анкет"
          disabled={!hasProfile}
          disabledHint={!hasProfile ? "Сначала заполни анкету" : undefined}
          loading={buyingKey === "best_team"}
          onBuy={() => buy("best_team", "лучший подбор открыт")}
        />
        <Offer
          icon={TrendingUp}
          title="Поднять анкету в топ"
          price="7⭐"
          desc="Твоя анкета выше в поиске у других игроков на 24 часа"
          disabled={!hasProfile}
          disabledHint={!hasProfile ? "Сначала заполни анкету" : undefined}
          loading={buyingKey === "highlight"}
          onBuy={() => buy("highlight", "анкета поднята")}
        />
        <div className="rounded-3xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
              <BookOpen className="size-5" />
            </span>
            <div>
              <p className="font-display text-base font-bold">Премиум-гайды</p>
              <p className="text-xs text-muted-foreground">Цена у каждого своя — открывай в разделе «Гайды»</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Offer({
  icon: Icon,
  title,
  price,
  desc,
  disabled,
  disabledHint,
  loading,
  onBuy,
}: {
  icon: typeof Zap
  title: string
  price: string
  desc: string
  disabled?: boolean
  disabledHint?: string
  loading?: boolean
  onBuy: () => void
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-stars/15 text-stars">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-bold">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
        </div>
        <span className="font-display text-lg font-bold text-stars">{price}</span>
      </div>
      <button
        type="button"
        onClick={onBuy}
        disabled={disabled || loading}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-stars py-3 text-sm font-bold text-background disabled:opacity-50"
      >
        {loading ? "Открываем оплату…" : disabled ? disabledHint : `Купить за ${price}`}
      </button>
    </div>
  )
}
