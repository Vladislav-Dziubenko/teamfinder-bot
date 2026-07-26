"use client"

import { useState, useEffect } from "react"
import {
  Gamepad2,
  Trophy,
  Heart,
  Timer,
  ArrowUp,
  ArrowDown,
  Medal,
  ChevronRight,
  Sparkles,
} from "lucide-react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts"
import {
  getOverview,
  getProgress,
  useAchievements,
  useRankInfo,
  type StatRange,
  type OverviewStat,
  type ProgressPoint,
} from "@/lib/stats"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

export function StatsTab({ onOpenLeaderboard }: { onOpenLeaderboard?: () => void }) {
  const { t } = useI18n()
  const [range, setRange] = useState<StatRange>("7")
  const [ov, setOv] = useState<OverviewStat>(getOverview(range))
  const [progress, setProgress] = useState<ProgressPoint[]>(getProgress(range))
  const achievements = useAchievements()
  const rank = useRankInfo()
  const winrate = ov.games > 0 ? Math.round((ov.wins / ov.games) * 100) : 0

  useEffect(() => {
    setOv(getOverview(range))
    setProgress(getProgress(range))
  }, [range])

  return (
    <div className="space-y-4 px-4 py-5">
      <div>
        <h1 className="font-display text-2xl font-bold">{t("stats.title")}</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          {t("stats.subtitle")}
        </p>
      </div>

      {/* Range switch */}
      <div className="flex rounded-2xl border border-border bg-card p-1">
        {(["7", "30"] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={cn(
              "flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors",
              range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            {r === "7" ? t("stats.period_7d") : t("stats.period_30d")}
          </button>
        ))}
      </div>

      {/* Overview */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={Gamepad2} label={t("stats.games_played")} value={String(ov.games)} delta={ov.gamesDelta} />
        <StatCard icon={Trophy} label={t("stats.wins")} value={`${ov.wins}`} sub={t("stats.winrate", { pct: winrate })} delta={ov.winsDelta} />
        <StatCard icon={Heart} label={t("stats.favorite_game")} value={ov.favoriteGame} accent />
        <StatCard
          icon={Timer}
          label={t("stats.search_time")}
          value={formatMinutes(ov.searchMinutes, t)}
          delta={ov.searchDelta}
          invertDelta
        />
      </div>

      {/* Progress chart */}
      <section className="rounded-3xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-base font-bold">{t("stats.progress")}</h2>
          <div className="flex items-center gap-3 text-[11px]">
            <Legend color="var(--chart-1)" label={t("stats.games_chart")} />
            <Legend color="var(--accent)" label={t("stats.wins_chart")} />
          </div>
        </div>
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={progress} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="gGames" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gWins" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              />
              <Tooltip
                cursor={{ stroke: "var(--border)" }}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  color: "var(--popover-foreground)",
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--muted-foreground)" }}
              />
              <Area
                type="monotone"
                dataKey="games"
                name={t("stats.games_chart")}
                stroke="var(--chart-1)"
                strokeWidth={2}
                fill="url(#gGames)"
              />
              <Area
                type="monotone"
                dataKey="wins"
                name={t("stats.wins_chart")}
                stroke="var(--accent)"
                strokeWidth={2}
                fill="url(#gWins)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Rank */}
      <button
        type="button"
        onClick={onOpenLeaderboard}
        className="flex w-full items-center gap-3 rounded-3xl border border-stars/40 bg-stars/5 p-4 text-left active:scale-[0.99]"
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-stars/15">
          <Medal className="size-6 text-stars" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-bold leading-none">#{rank.position}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("stats.rank", { pct: rank.percentile, total: rank.total.toLocaleString("ru-RU") })}
          </p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
      </button>

      {/* Achievements */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h2 className="font-display text-base font-bold">{t("stats.achievements_title")}</h2>
        </div>
        <div className="space-y-2">
          {achievements.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary/60 text-xl">
                {a.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{a.title}</p>
                <p className="text-[11px] text-muted-foreground">{a.game}</p>
              </div>
              <span className="shrink-0 text-[11px] text-muted-foreground">{a.unlockedAt}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  delta,
  invertDelta = false,
  accent = false,
}: {
  icon: typeof Gamepad2
  label: string
  value: string
  sub?: string
  delta?: number
  invertDelta?: boolean
  accent?: boolean
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className={cn("grid size-8 place-items-center rounded-xl", accent ? "bg-accent/15" : "bg-primary/15")}>
          <Icon className={cn("size-4", accent ? "text-accent" : "text-primary")} />
        </span>
        {delta !== undefined && <Delta value={delta} invert={invertDelta} />}
      </div>
      <p className="mt-3 truncate font-display text-2xl font-bold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{sub ?? label}</p>
    </div>
  )
}

function Delta({ value, invert }: { value: number; invert?: boolean }) {
  const good = invert ? value < 0 : value > 0
  const Arrow = value >= 0 ? ArrowUp : ArrowDown
  return (
    <span
      className={cn(
        "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold",
        good ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive",
      )}
    >
      <Arrow className="size-3" />
      {Math.abs(value)}%
    </span>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-muted-foreground">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

function formatMinutes(min: number, t: ReturnType<typeof useI18n>["t"]): string {
  if (min < 60) return `${min} ${t("common.min_short")}`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} ${t("common.hour_short")} ${m} ${t("common.min_short")}` : `${h} ${t("common.hour_short")}`
}
