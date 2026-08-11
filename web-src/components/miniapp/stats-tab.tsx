"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Clock, Search, Package, Users, Trophy, Sparkles,
  Medal, ChevronRight, Loader2, Gamepad2, Eye, Gift,
  BarChart3, Calendar, History, Crown, ArrowDownUp,
} from "lucide-react"
import {
  getGeneralStats, useRecentAchievements, useRankInfo,
  type GeneralStats,
} from "@/lib/stats"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { api } from "@/lib/api"
import { useNexus } from "@/lib/store"
import { rarityMeta } from "@/lib/data"

type Period = 1 | 7 | 30

const PERIOD_LABELS: Record<Period, string> = { 1: "День", 7: "Неделя", 30: "Месяц" }

const GAME_ICONS: Record<string, string> = {
  "CS:GO": "🎯",
  "War Thunder": "⚔️",
  "Roblox": "🎮",
  "Dota 2": "🛡️",
  "Valorant": "🔫",
  " Fortnite": "🏗️",
}

type CaseOpenRecord = {
  case_id: string
  case_name: string
  opened_at: string
  item_key: string
  item_name: string
  rarity: string
  image?: string
  icon?: string
  kind?: string
}

export function StatsTab({ onOpenLeaderboard }: { onOpenLeaderboard?: () => void }) {
  const { t } = useI18n()
  const [period, setPeriod] = useState<Period>(30)
  const [stats, setStats] = useState<GeneralStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [history, setHistory] = useState<CaseOpenRecord[] | null>(null)
  const { lootCases } = useNexus()

  const achievements = useRecentAchievements()
  const rank = useRankInfo()

  useEffect(() => {
    setLoading(true)
    getGeneralStats(period).then((s) => {
      setStats(s)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [period])

  useEffect(() => {
    api.get("/api/nexus/cases/history").then((d: any) => setHistory(d.history ?? [])).catch(() => setHistory([]))
  }, [])

  const tierList = useMemo(() => {
    const items: { key: string; name: string; rarity: string; sell: number; image?: string; icon?: string; kind?: string }[] = []
    for (const c of lootCases) {
      for (const it of c.items ?? []) {
        if (items.some((x) => x.key === it.key)) continue
        items.push({ key: it.key, name: it.name, rarity: it.rarity, sell: it.sell ?? 0, image: it.image, icon: it.icon, kind: it.kind })
      }
    }
    return items
      .filter((i) => (i.sell ?? 0) > 0)
      .sort((a, b) => b.sell - a.sell)
      .slice(0, 30)
  }, [lootCases])

  return (
    <div className="space-y-4 px-4 py-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Статистика</h1>
        <p className="text-sm text-muted-foreground text-pretty">Твоя активность, достижения и место в рейтинге</p>
      </div>

      {/* Period selector */}
      <div className="flex rounded-2xl border border-border bg-card p-1">
        {([1, 7, 30] as const).map((p) => (
          <button key={p} type="button" onClick={() => setPeriod(p)}
            className={cn("flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors", period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>
      ) : stats ? (
        <>
          {/* Main stat cards */}
          <div className="grid grid-cols-2 gap-3">
            <BigStatCard
              icon={Calendar}
              label="Активных дней"
              value={String(stats.activeDays)}
              sub={stats.activeDays > 0 ? `${Math.round(stats.totalEvents / Math.max(stats.activeDays, 1))} действий/день` : undefined}
            />
            <BigStatCard
              icon={Search}
              label="Поисков"
              value={String(stats.searches)}
              accent
            />
            <BigStatCard
              icon={Package}
              label="Открытий кейсов"
              value={String(stats.caseOpens)}
            />
            <BigStatCard
              icon={Users}
              label="Заявок в тимы"
              value={String(stats.teamApps)}
              accent
            />
          </div>

          {/* Secondary stats */}
          <div className="grid grid-cols-3 gap-2">
            <MiniStatCard icon={Eye} label="Реклама" value={String(stats.adWatches)} />
            <MiniStatCard icon={Gift} label="Рефералы" value={String(stats.referrals)} />
            <MiniStatCard icon={Trophy} label="Достижения" value={String(stats.totalAchievements)} />
          </div>

          {/* Achievements by game */}
          {Object.keys(stats.achievementsByGame).length > 0 && (
            <section className="rounded-3xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <BarChart3 className="size-4 text-primary" />
                <h2 className="font-display text-base font-bold">Достижения по играм</h2>
              </div>
              <div className="space-y-2">
                {Object.entries(stats.achievementsByGame)
                  .sort(([, a], [, b]) => b - a)
                  .map(([game, count]) => (
                    <div key={game} className="flex items-center gap-3 rounded-xl bg-secondary/30 px-3 py-2">
                      <span className="text-xl">{GAME_ICONS[game] || "🏆"}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{game}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {count} {declension(count, "достижение", "достижения", "достижений")}
                        </p>
                      </div>
                      <span className="font-display text-lg font-bold text-primary">{count}</span>
                    </div>
                  ))}
              </div>
            </section>
          )}

          {/* Activity breakdown */}
          {Object.keys(stats.eventsByType).length > 0 && (
            <section className="rounded-3xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="size-4 text-accent" />
                <h2 className="font-display text-base font-bold">Откуда активность</h2>
              </div>
              <div className="space-y-1.5">
                {Object.entries(stats.eventsByType)
                  .sort(([, a], [, b]) => b - a)
                  .map(([event, count]) => (
                    <div key={event} className="flex items-center justify-between rounded-xl px-3 py-2">
                      <span className="text-sm text-muted-foreground">{eventLabel(event)}</span>
                      <span className="text-sm font-bold">{count}</span>
                    </div>
                  ))}
              </div>
            </section>
          )}

          {/* Leaderboard */}
          <button type="button" onClick={onOpenLeaderboard} className="flex w-full items-center gap-3 rounded-3xl border border-stars/40 bg-stars/5 p-4 text-left active:scale-[0.99]">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-stars/15"><Medal className="size-6 text-stars" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-bold leading-none">#{rank?.position ?? "—"}</p>
              <p className="mt-1 text-xs text-muted-foreground">{rank ? `в общем рейтинге · топ ${rank.percentile}% из ${rank.total.toLocaleString("ru-RU")}` : "Рейтинг загружается..."}</p>
            </div>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
          </button>

          {/* Тир-лист скинов */}
          {tierList.length > 0 && (
            <section className="rounded-3xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <Crown className="size-4 text-stars" />
                <h2 className="font-display text-base font-bold">Тир-лист скинов</h2>
              </div>
              <div className="space-y-1.5">
                {tierList.map((it, i) => {
                  const meta = rarityMeta[it.rarity as keyof typeof rarityMeta] ?? rarityMeta.common
                  return (
                    <div key={it.key} className="flex items-center gap-3 rounded-xl bg-secondary/30 px-3 py-2">
                      <span className="w-7 shrink-0 text-center font-display text-xs font-bold text-muted-foreground">
                        {i + 1}
                      </span>
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-background/60">
                        {it.image ? <img src={it.image} alt="" className="size-6 object-contain" /> : <span className="text-base">{it.icon ?? "🎁"}</span>}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{it.name}</p>
                        <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: meta.color }}>
                          {meta.label}
                        </p>
                      </div>
                      <span className="flex shrink-0 items-center gap-1 font-display text-sm font-bold">
                        <img src="/nexus-coin.webp" alt="" className="size-3.5 rounded-full" /> {it.sell.toLocaleString("ru-RU")}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* История открытий кейсов */}
          <section>
            <div className="mb-2 flex items-center gap-2">
              <History className="size-4 text-primary" />
              <h2 className="font-display text-base font-bold">История кейсов</h2>
            </div>
            {history === null ? (
              <p className="text-sm text-muted-foreground">Загрузка...</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Пока нет открытий</p>
            ) : (
              <div className="space-y-2">
                {history.map((h, i) => {
                  const meta = rarityMeta[h.rarity as keyof typeof rarityMeta] ?? rarityMeta.common
                  return (
                    <div key={i} className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary/60">
                        {h.image ? <img src={h.image} alt="" className="size-8 object-contain" /> : <span className="text-lg">{h.icon ?? "🎁"}</span>}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{h.item_name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {h.case_name} · {formatDate(h.opened_at)}
                        </p>
                      </div>
                      <span className="shrink-0 text-[10px] font-bold uppercase" style={{ color: meta.color }}>
                        {meta.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Recent achievements */}
          <section>
            <div className="mb-2 flex items-center gap-2"><Sparkles className="size-4 text-primary" /><h2 className="font-display text-base font-bold">Последние достижения</h2></div>
            <div className="space-y-2">
              {(!Array.isArray(achievements) || achievements.length === 0) && <p className="text-sm text-muted-foreground">Пока нет достижений</p>}
              {Array.isArray(achievements) && achievements.map((a) => (
                <div key={a.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary/60 text-xl">{a.icon}</span>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{a.title}</p><p className="text-[11px] text-muted-foreground">{a.game}</p></div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{a.unlockedAt}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <p className="py-10 text-center text-sm text-muted-foreground">Не удалось загрузить статистику</p>
      )}
    </div>
  )
}

/* ── Small components ────────────────────────────────────────── */

function BigStatCard({ icon: Icon, label, value, sub, accent }: {
  icon: typeof Calendar; label: string; value: string; sub?: string; accent?: boolean
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-4">
      <span className={cn("grid size-8 place-items-center rounded-xl", accent ? "bg-accent/15" : "bg-primary/15")}>
        <Icon className={cn("size-4", accent ? "text-accent" : "text-primary")} />
      </span>
      <p className="mt-3 font-display text-2xl font-bold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{sub ?? label}</p>
    </div>
  )
}

function MiniStatCard({ icon: Icon, label, value }: {
  icon: typeof Eye; label: string; value: string
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-card p-3 text-center">
      <Icon className="size-4 text-muted-foreground" />
      <p className="font-display text-lg font-bold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  )
}

function eventLabel(event: string): string {
  const map: Record<string, string> = {
    search: "Поиск тиммейтов",
    case_open: "Открытие кейсов",
    team_app: "Заявки в тимы",
    ad_watch: "Просмотр рекламы",
    achievement_claim: "Получение достижений",
    donate: "Донат / покупки",
    profile: "Просмотр профиля",
    me: "Запрос данных",
    api_call: "Другое",
  }
  return map[event] || event
}

function declension(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 19) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}

function formatDate(iso: string): string {
  if (!iso) return ""
  try {
    const d = new Date(iso)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 60_000) return "только что"
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)} мин назад`
    if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)} ч назад`
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
  } catch {
    return iso
  }
}
