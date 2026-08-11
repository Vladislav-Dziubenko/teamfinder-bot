"use client"

import { Crosshair, Trophy, Clock, Zap, Lock, Star, Crown, Award, MessageCircle, Search } from "lucide-react"
import type { Player } from "@/lib/data"
import { games, roleL10nKey, rankL10nKey, caseItemByKey } from "@/lib/data"
import { useI18n } from "@/lib/i18n"
import { useNexus } from "@/lib/store"

export function PlayerCard({
  player,
  onConnect,
  onChat,
  onUnlock,
  locked = false,
  index = 0,
}: {
  player: Player
  onConnect: (p: Player) => void
  onChat?: (p: Player) => void
  onUnlock?: (p: Player) => void
  locked?: boolean
  index?: number
}) {
  const { t, tl } = useI18n()
  const { lootCases } = useNexus()
  const skinMeta = player.skin ? caseItemByKey(player.skin, lootCases) : undefined
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

        {/* discord badge */}
        {player.has_discord && (
          <span
            className="absolute left-3 top-11 flex items-center gap-1 rounded-lg border border-border bg-[#5865F2]/90 px-2 py-1 text-[10px] font-bold text-white backdrop-blur"
            title="Discord connected"
          >
            🎧 Discord
          </span>
        )}

        {/* витрина скинов: предмет, выставленный игроком */}
        {skinMeta && (
          <span className="absolute left-3 top-[4.7rem] flex max-w-[60%] items-center gap-1 truncate rounded-lg border border-border bg-background/70 px-2 py-1 text-[10px] font-bold backdrop-blur">
            {skinMeta.icon ? (
              <span className="text-xs leading-none">{skinMeta.icon}</span>
            ) : skinMeta.image ? (
              <img src={skinMeta.image} alt="" className="h-3.5 w-3.5 object-cover" />
            ) : null}
            <span className="truncate">{skinMeta.name}</span>
          </span>
        )}

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
            {player.reason === "donor" ? t("player_card.badge_donor") : t("player_card.badge_veteran")}
          </span>
        )}
        {!player.locked && (
          <span className="absolute right-3 top-3 flex items-center gap-1 rounded-lg bg-primary/90 px-2 py-1 text-xs font-bold text-primary-foreground">
            <Zap className="size-3 fill-primary-foreground" />
            {t("player_card.match_pct", { pct: player.vibe })}
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
              {player.online ? t("common.online") : player.lastSeen ?? t("common.offline")}
            </span>
            <div className="absolute bottom-3 left-3">
              <h3 className="font-display text-xl font-bold leading-none">{player.nick}</h3>
              <p className="text-sm text-muted-foreground">
                {player.realName} · {tl(rankL10nKey(player.game, player.rank), player.rank)}
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
              {player.reason === "donor" ? t("player_card.locked_donor") : t("player_card.locked_veteran")}
            </p>
            <p className="text-[11px] text-muted-foreground">{t("player_card.locked_hint")}</p>
          </div>
        )}
      </div>

      <div className="p-4">
        {/* stats */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <Stat icon={Crosshair} label={t("player_card.stat_role")} value={locked ? "???" : tl(roleL10nKey(player.game, player.role), player.role)} />
          <Stat icon={Trophy} label={t("player_card.stat_winrate")} value={locked ? "??" : `${player.winrate}%`} />
          <Stat
            icon={Clock}
            label={t("player_card.stat_hours")}
            value={
              locked
                ? "??"
                : player.hours > 999
                  ? `${(player.hours / 1000).toFixed(1)}k ${t("common.hour_short")}`
                  : `${player.hours} ${t("common.hour_short")}`
            }
          />
          <Stat
            icon={Search}
            label={t("player_card.stat_searching")}
            value={locked ? "??" : player.searching_minutes ? `${player.searching_minutes} ${t("common.min_short")}` : "—"}
          />
        </div>

        {/* tags */}
        {!locked && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(player.tags ?? []).map((t) => (
              <span
                key={t}
                className="rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-[11px] text-muted-foreground"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {/* favorite games */}
        {player.fav_games && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {player.fav_games.split(",").map((gid) => {
              const gm = games.find((g) => g.id === gid)
              if (!gm) return null
              return (
                <span
                  key={gid}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/30 px-2 py-0.5 text-[10px] font-medium"
                  style={{ color: gm.color }}
                >
                  {gm.emoji} {gm.short}
                </span>
              )
            })}
          </div>
        )}

        {locked ? (
          <button
            type="button"
            onClick={() => onUnlock?.(player)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-stars py-3 text-sm font-bold text-background shadow-[0_0_20px_-6px_var(--stars)] transition-transform active:scale-[0.98]"
          >
            <Star className="size-4 fill-background" /> {t("player_card.unlock_for", { cost: player.unlockStars ?? 0 })}
          </button>
        ) : (
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => onConnect(player)}
              className="flex-1 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-[0_0_20px_-6px_var(--primary)] transition-transform active:scale-[0.98]"
            >
              {t("player_card.connect")}
            </button>
            {onChat && (
              <button
                type="button"
                onClick={() => onChat(player)}
                aria-label={t("player_card.send_message", { name: player.nick })}
                className="grid size-12 shrink-0 place-items-center rounded-2xl border border-border bg-secondary/60 text-accent transition-transform active:scale-[0.95]"
              >
                <MessageCircle className="size-5" />
              </button>
            )}
          </div>
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
