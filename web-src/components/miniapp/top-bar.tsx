"use client"

import { useEffect, useState } from "react"
import { Star, Bell } from "lucide-react"
import { useNexus } from "@/lib/store"
import { useI18n } from "@/lib/i18n"
import { formatCompact } from "@/lib/format"

export function TopBar({
  onStars,
  onCoins,
  onChangelog,
  hasUpdate,
}: {
  onStars: () => void
  onCoins: () => void
  onChangelog: () => void
  hasUpdate: boolean
}) {
  const { t } = useI18n()
  const { stars, coins } = useNexus()
  const [tgPhoto, setTgPhoto] = useState<string | null>(null)
  useEffect(() => {
    try {
      setTgPhoto((window as any).Telegram?.WebApp?.initDataUnsafe?.user?.photo_url || null)
    } catch { setTgPhoto(null) }
  }, [])

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-3 min-w-0">
        <div className="flex items-center gap-2 min-w-0 shrink">
          <div className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary font-display text-lg font-bold text-primary-foreground">
            {tgPhoto ? (
              <img src={tgPhoto} alt="" className="size-full object-cover" />
            ) : (
              "N"
            )}
            <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-accent ring-2 ring-background" />
          </div>
          <div className="leading-tight min-w-0 flex-1">
            <div className="flex min-w-0 items-baseline gap-1.5">
              <p className="shrink-0 font-display text-lg font-bold tracking-wide">NEXUS</p>
              <span className="hidden min-[400px:inline-block] shrink-0 rounded-md bg-primary/15 px-1.5 py-0.5 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
                TeamHub
              </span>
            </div>
            <p className="-mt-0.5 truncate text-[11px] text-muted-foreground">{t("topbar.tagline")}</p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Nexus coins */}
          <button
            type="button"
            onClick={onCoins}
            className="flex min-w-[4.5rem] shrink-0 items-center justify-center gap-1 rounded-xl border border-primary/30 bg-primary/10 px-2 py-1.5 text-xs font-semibold tabular-nums text-primary transition-transform active:scale-95"
            aria-label={t("topbar.coins")}
          >
            <img src="/nexus-coin.webp" alt="" className="size-4 shrink-0 rounded-full object-cover" />
            {formatCompact(coins)}
          </button>
          {/* Telegram Stars */}
          <button
            type="button"
            onClick={onStars}
            className="flex min-w-[4.5rem] shrink-0 items-center justify-center gap-1 rounded-xl border border-stars/30 bg-stars/10 px-2 py-1.5 text-xs font-semibold tabular-nums text-stars transition-transform active:scale-95"
            aria-label={t("topbar.stars")}
          >
            <Star className="size-3.5 shrink-0 fill-stars" />
            {formatCompact(stars)}
          </button>
          {/* Changelog bell — последним: ширина пилюль слева больше не толкает его */}
          <button
            type="button"
            onClick={onChangelog}
            className="relative grid size-8 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-secondary/50 active:scale-90"
            aria-label={t("topbar.updates")}
          >
            <Bell className="size-4" />
            {hasUpdate && (
              <span className="absolute right-0.5 top-0.5 size-2 rounded-full bg-red-500 ring-2 ring-background animate-pulse" />
            )}
          </button>
        </div>
      </div>
    </header>
  )
}
