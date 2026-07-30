"use client"

import { useRef } from "react"
import { Star } from "lucide-react"
import { useNexus, useMe } from "@/lib/store"
import { useI18n } from "@/lib/i18n"

export function TopBar({ onStars, onCoins }: { onStars: () => void; onCoins: () => void }) {
  const { t } = useI18n()
  const { stars, coins, setAvatar } = useNexus()
  const { avatar } = useMe()
  const fileRef = useRef<HTMLInputElement>(null)

  function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => setAvatar(reader.result as string)
    reader.readAsDataURL(f)
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative grid size-9 place-items-center overflow-hidden rounded-xl bg-primary font-display text-lg font-bold text-primary-foreground transition-transform active:scale-90"
          >
            {avatar ? (
              <img src={avatar} alt="" className="size-full object-cover" />
            ) : (
              "N"
            )}
            <span className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition-opacity hover:opacity-100">
              <svg className="size-4 text-white" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </span>
            <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-accent ring-2 ring-background" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={onPickPhoto} className="hidden" />
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
            <img src="/nexus-coin.png" alt="" className="size-5 rounded-full object-cover" />
            {coins}
          </button>
          {/* Telegram Stars */}
          <button
            type="button"
            onClick={onStars}
            className="flex items-center gap-1.5 rounded-xl border border-stars/30 bg-stars/10 px-2.5 py-2 text-sm font-semibold text-stars transition-transform active:scale-95"
            aria-label={t("topbar.stars")}
          >
            <Star className="size-4 fill-stars" />
            {stars}
          </button>
        </div>
      </div>
    </header>
  )
}
