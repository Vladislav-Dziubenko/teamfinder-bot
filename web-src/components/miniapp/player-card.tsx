"use client"

import { Crosshair, Clock, Zap, MapPin } from "lucide-react"
import type { MatchResult } from "@/lib/api"
import { gameColor } from "@/lib/data"

export function PlayerCard({
  player,
  game,
  onConnect,
  index = 0,
}: {
  player: MatchResult
  game: string
  onConnect: (p: MatchResult) => void
  index?: number
}) {
  return (
    <article
      className="animate-rise overflow-hidden rounded-3xl border border-border bg-card"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="relative flex h-28 items-center justify-center bg-secondary">
        <span className="font-display text-4xl font-bold text-muted-foreground">
          {player.nickname.charAt(0).toUpperCase()}
        </span>
        <span
          className="absolute left-3 top-3 rounded-lg border border-border bg-background/70 px-2 py-1 font-display text-xs font-bold tracking-wide backdrop-blur"
          style={{ color: gameColor(game) }}
        >
          {player.rank}
        </span>
        <span className="absolute right-3 top-3 flex items-center gap-1 rounded-lg bg-primary/90 px-2 py-1 text-xs font-bold text-primary-foreground">
          <Zap className="size-3 fill-primary-foreground" />
          {player.score}% мэтч
        </span>
      </div>

      <div className="p-4">
        <h3 className="font-display text-xl font-bold leading-none">{player.nickname}</h3>
        {player.region && (
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3" /> {player.region}
          </p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
          <Stat icon={Crosshair} label="Роль" value={player.role} />
          <Stat icon={Clock} label="Онлайн" value={player.playtime} />
        </div>

        <button
          type="button"
          onClick={() => onConnect(player)}
          className="mt-4 w-full rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-[0_0_20px_-6px_var(--primary)] transition-transform active:scale-[0.98]"
        >
          {player.contact ? "Связаться" : "Открыть контакт"}
        </button>
      </div>
    </article>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Crosshair
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl bg-secondary/50 py-2">
      <Icon className="mx-auto size-4 text-primary" />
      <p className="mt-1 truncate text-xs font-semibold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  )
}
