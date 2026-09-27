"use client"

import { Star, Bell, Crosshair, Coins } from "lucide-react"
import { useNexus } from "@/lib/store"
import { useI18n } from "@/lib/i18n"
import { hapticTap } from "@/lib/webapp"
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

  return (
    <header className="nexus-header">
      <div className="nexus-header-inner">
        <div className="nexus-wordmark" aria-label="NEXUS TeamHub">
          <span className="nexus-mark"><Crosshair className="size-5" strokeWidth={2.5} /></span>
          <span>NEXUS<span className="text-primary">.</span></span>
        </div>

        <div className="nexus-wallet">
          {/* Nexus coins */}
          <button
            type="button"
            onClick={() => {
              hapticTap()
              onCoins()
            }}
            className="nexus-balance text-foreground"
            aria-label={t("topbar.coins")}
            title={t("topbar.coins")}
          >
            <Coins className="size-3.5 shrink-0 text-primary" />
            {formatCompact(coins)}
          </button>
          {/* Telegram Stars */}
          <button
            type="button"
            onClick={() => {
              hapticTap()
              onStars()
            }}
            className="nexus-balance text-foreground"
            aria-label={t("topbar.stars")}
            title={t("topbar.stars")}
          >
            <Star className="size-3.5 shrink-0 fill-stars" />
            {formatCompact(stars)}
          </button>
          {/* Changelog bell — последним: ширина пилюль слева больше не толкает его */}
          <button
            type="button"
            onClick={() => {
              hapticTap()
              onChangelog()
            }}
            className="nexus-icon-button"
            aria-label={t("topbar.updates")}
            title={t("topbar.updates")}
          >
            <Bell className="size-4" />
            {hasUpdate && (
              <span className="absolute right-2 top-2 size-1.5 rounded-full bg-primary ring-2 ring-background" />
            )}
          </button>
        </div>
      </div>
    </header>
  )
}
