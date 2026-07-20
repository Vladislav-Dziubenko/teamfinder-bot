"use client"

import { Crosshair, Trophy, Clock, Zap, Lock, Star, Crown, Award } from "lucide-react"
import type { Player } from "@/lib/data"
import { games } from "@/lib/data"

export function PlayerCard({
  player,
  onConnect,
  onUnlock,
  locked = false,
  index = 0,
}: {
  player: Player
  onConnect: (p: Player) => void
  onUnlock?: (p: Player) => void
  locked?: boolean
  index?: number
}) {
  const game = games.find((g) => g.id === player.game)

  return (
    <article
      className="animate-rise overflow-hidden rounded-3xl border border-border bg-card"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="relative">
        <img
          src={player.avatar || "/placeholder.svg"}
          alt={player.nick}
          className={`h-44 w-full object-cover ${locked ? "blur-md" : ""}`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />

        {/* game tag */}
        <span
          className="absolute left-3 top-3 rounded-lg border border-border bg-background/70 px-2 py-1 font-display text-xs font-bold tracking-wide backdrop-blur"
          style={{ color: game?.color }}
        >
          {game?.short}
        </span>

        {/* badge — почему необычный */}
        {player.locked && (
          <span
            className="absolute right-3 top-3 flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold"
            style={{
              background: player.reason === "donor" ? "color-mix(in oklch, var(--stars) 90%, transparent)" : "color-mix(in oklch, var(--accent) 90%, transparent)",
              color: "var(--background)",
            }}
          >
            {player.reason === "donor" ? <Crown className="size-3" /> : <Award className="size-3" />}
            {player.reason === "donor" ? "Топ-донатер" : "Ветеран"}
          </span>
        )}
        {!player.locked && (
          <span className="absolute right-3 top-3 flex items-center gap-1 rounded-lg bg-primary/90 px-2 py-1 text-xs font-bold text-primary-foreground">
            <Zap className="size-3 fill-primary-foreground" />
            {player.vibe}% мэтч
          </span>
        )}

        {!locked && (
          <>
            <span className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-background/70 px-2.5 py-1 text-[11px] font-medium backdrop-blur">
              <span
                className={
                  player.online
                    ? "size-2 rounded-full bg-accent animate-pulse-ring"
                    : "size-2 rounded-full bg-muted-foreground"
                }
              />
              {player.online ? "в сети" : player.lastSeen ?? "не в сети"}
            </span>
            <div className="absolute bottom-3 left-3">
              <h3 className="font-display text-xl font-bold leading-none">{player.nick}</h3>
              <p className="text-sm text-muted-foreground">
                {player.realName} · {player.rank}
              </p>
            </div>
          </>
        )}

        {/* Locked overlay */}
        {locked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/50 px-4 text-center backdrop-blur-[2px]">
            <span className="grid size-12 place-items-center rounded-full bg-background/80">
              <Lock className="size-5 text-stars" />
            </span>
            <p className="font-display text-base font-bold text-balance">
              {player.reason === "donor" ? "Анкета топ-донатера" : "Анкета ветерана"}
            </p>
            <p className="text-[11px] text-muted-foreground">Открой за Telegram Stars</p>
          </div>
        )}
      </div>

      <div className="p-4">
        {/* stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat icon={Crosshair} label="Роль" value={locked ? "???" : player.role} />
          <Stat icon={Trophy} label="Винрейт" value={locked ? "??" : `${player.winrate}%`} />
          <Stat
            icon={Clock}
            label="В игре"
            value={
              locked
                ? "??"
                : player.hours > 999
                  ? `${(player.hours / 1000).toFixed(1)}k ч`
                  : `${player.hours} ч`
            }
          />
        </div>

        {/* tags */}
        {!locked && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {player.tags.map((t) => (
              <span
                key={t}
                className="rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-[11px] text-muted-foreground"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {locked ? (
          <button
            type="button"
            onClick={() => onUnlock?.(player)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-stars py-3 text-sm font-bold text-background shadow-[0_0_20px_-6px_var(--stars)] transition-transform active:scale-[0.98]"
          >
            <Star className="size-4 fill-background" /> Открыть за {player.unlockStars} Stars
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onConnect(player)}
            className="mt-4 w-full rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-[0_0_20px_-6px_var(--primary)] transition-transform active:scale-[0.98]"
          >
            Связаться
          </button>
        )}
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
