"use client"

import { Users, MapPin, Shield } from "lucide-react"
import type { Team } from "@/lib/data"
import { games } from "@/lib/data"

export function TeamCard({
  team,
  onJoin,
  index = 0,
}: {
  team: Team
  onJoin: (t: Team) => void
  index?: number
}) {
  const game = games.find((g) => g.id === team.game)
  const slots = Array.from({ length: team.maxMembers })

  return (
    <article
      className="animate-rise rounded-3xl border border-border bg-card p-4"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl border border-border bg-secondary font-display text-sm font-bold tracking-wider text-primary">
            {team.tag}
          </div>
          <div>
            <h3 className="font-display text-lg font-bold leading-tight">{team.name}</h3>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3" /> {team.region}
            </p>
          </div>
        </div>
        <span
          className="rounded-lg border border-border bg-background/50 px-2 py-1 font-display text-xs font-bold"
          style={{ color: game?.color }}
        >
          {game?.short}
        </span>
      </div>

      {/* slots */}
      <div className="mt-4 flex items-center gap-2">
        {slots.map((_, i) => (
          <span
            key={i}
            className={
              i < team.members
                ? "h-1.5 flex-1 rounded-full bg-primary"
                : "h-1.5 flex-1 rounded-full bg-secondary"
            }
          />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 text-muted-foreground">
          <Users className="size-3.5" /> {team.members}/{team.maxMembers} в составе
        </span>
        <span className="flex items-center gap-1 font-medium text-accent">
          <Shield className="size-3.5" /> {team.minRank}
        </span>
      </div>

      <div className="mt-3 rounded-2xl bg-secondary/50 p-3">
        <p className="text-xs text-muted-foreground">Нужен игрок</p>
        <p className="font-display text-base font-semibold text-primary">{team.needRole}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {team.vibe.map((v) => (
            <span key={v} className="rounded-full bg-background/60 px-2 py-0.5 text-[11px] text-muted-foreground">
              {v}
            </span>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onJoin(team)}
        className="mt-4 w-full rounded-2xl border border-primary/40 bg-primary/10 py-3 text-sm font-semibold text-primary transition-transform active:scale-[0.98]"
      >
        Подать заявку
      </button>
    </article>
  )
}
