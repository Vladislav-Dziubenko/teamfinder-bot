"use client"

import { useEffect, useState } from "react"
import { Star } from "lucide-react"
import { useNexus } from "@/lib/store"
import { useI18n } from "@/lib/i18n"
import { formatNum } from "@/lib/format"

export function TopBar({ onStars, onCoins }: { onStars: () => void; onCoins: () => void }) {
  const { t } = useI18n()
  const { stars, coins } = useNexus()
  // Читаем window только в effect (после гидратации) — иначе статический HTML
  // и клиентский рендер не совпадают (React hydration error #418).
  const [tgPhoto, setTgPhoto] = useState<string | null>(null)
  useEffect(() => {
    try {
      setTgPhoto((window as any).Telegram?.WebApp?.initDataUnsafe?.user?.photo_url || null)
    } catch { setTgPhoto(null) }
  }, [])

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="relative grid size-9 place-items-center overflow-hidden rounded-xl bg-primary font-display text-lg font-bold text-primary-foreground">
            {tgPhoto ? (
              <img src={tgPhoto} alt="" className="size-full object-cover" />
            ) : (
              "N"
            )}
            <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-accent ring-2 ring-background" />
          </div>
          <div className="leading-tight">
            <p className="font-display text-lg font-bold tracking-wide">NEXUS</p>
            <p className="-mt-1 text-[11px] text-muted-foreground">{t("topbar.tagline")}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Nexus-монетки */}
          <button
            type="button"
            onClick={onCoins}
            className="flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-2.5 py-2 text-sm font-semibold text-primary transition-transform active:scale-95"
            aria-label={t("topbar.coins")}
          >
            <img src="/nexus-coin.webp" alt="" className="size-5 rounded-full object-cover" />
            {formatNum(coins)}
          </button>
          {/* Telegram Stars */}
          <button
            type="button"
            onClick={onStars}
            className="flex items-center gap-1.5 rounded-xl border border-stars/30 bg-stars/10 px-2.5 py-2 text-sm font-semibold text-stars transition-transform active:scale-95"
            aria-label={t("topbar.stars")}
          >
            <Star className="size-4 fill-stars" />
            {formatNum(stars)}
          </button>
        </div>
      </div>
    </header>
  )
}
