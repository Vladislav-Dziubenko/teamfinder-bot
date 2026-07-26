"use client"

import { useState, useEffect } from "react"
import { Swords, Flame, Trophy, Radio, BookOpen, Ticket } from "lucide-react"
import { api } from "@/lib/api"
import { useMe } from "@/lib/store"
import type { TabId } from "./bottom-nav"
import type { Player } from "@/lib/data"

type Quest = {
  title: string
  desc: string
  reward: string
  progress: number
  target: number
}

export function HomeTab({
  onGo,
  onConnect,
}: {
  onGo: (t: TabId) => void
  onConnect: (p: Player) => void
}) {
  const { wins, level } = useMe()
  const [quests, setQuests] = useState<Quest[]>([])
  const [searchCount, setSearchCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [questData, countData] = await Promise.all([
          api.get("/api/nexus/quests"),
          api.get("/api/search/count"),
        ])
        if (!cancelled) {
          setQuests(questData.quests ?? [])
          setSearchCount(countData.count ?? 0)
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Ошибка загрузки")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const daily = quests[0]

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-4 py-5">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 px-4 py-5">
      {/* Hero */}
      <section className="animate-rise relative overflow-hidden rounded-3xl border border-border">
        <img src="/hero-arena.png" alt="" className="h-52 w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/10" />
        <div className="absolute inset-x-0 bottom-0 p-5">
          <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent">
            <Radio className="size-3" /> {searchCount ?? "—"} игроков в поиске
          </span>
          <h1 className="font-display text-3xl font-bold leading-none text-balance text-glow-primary">
            Найди свою команду мечты
          </h1>
          <p className="mt-1.5 max-w-[16rem] text-sm text-muted-foreground text-pretty">
            Подбор тиммейтов по игре, рангу и вайбу — без токсиков и рандомов.
          </p>
          <button
            type="button"
            onClick={() => onGo("match")}
            className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)] transition-transform active:scale-95"
          >
            <Swords className="size-4" /> Начать поиск
          </button>
        </div>
      </section>

      {/* Quick stats */}
      <section className="grid grid-cols-2 gap-3">
        <MiniStat icon={Trophy} value={wins ?? "—"} label="Побед" tint="var(--primary)" />
        <MiniStat icon={Flame} value={level ? `LVL ${level}` : "—"} label="Уровень" tint="var(--stars)" />
      </section>

      {/* Quick access */}
      <section className="grid grid-cols-3 gap-3">
        <QuickLink icon={Trophy} label="Батл-пасс" tint="var(--stars)" onClick={() => onGo("battlepass")} />
        <QuickLink icon={Ticket} label="Промокоды" tint="var(--primary)" onClick={() => onGo("promo")} />
        <QuickLink icon={BookOpen} label="Гайды" tint="var(--accent)" onClick={() => onGo("guides")} />
      </section>

      {/* Daily quest */}
      {loading ? (
        <section className="flex items-center justify-center rounded-3xl border border-border p-10">
          <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </section>
      ) : daily ? (
        <section className="animate-scan relative overflow-hidden rounded-3xl border border-primary/30 bg-primary/5 p-5">
          <div className="relative z-10">
            <span className="text-xs font-medium uppercase tracking-widest text-primary">Задание дня</span>
            <p className="mt-1 font-display text-xl font-bold text-balance">{daily.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{daily.desc}</p>
            <p className="mt-1 text-xs text-primary">Награда: {daily.reward}</p>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, (daily.progress / daily.target) * 100)}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-primary">
                {daily.progress}/{daily.target}
              </span>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  )
}

function QuickLink({
  icon: Icon,
  label,
  tint,
  onClick,
}: {
  icon: typeof Trophy
  label: string
  tint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-card p-3 text-center active:scale-95"
    >
      <span
        className="grid size-9 place-items-center rounded-xl"
        style={{ background: `color-mix(in oklch, ${tint} 15%, transparent)` }}
      >
        <Icon className="size-5" style={{ color: tint }} />
      </span>
      <span className="text-[11px] font-semibold">{label}</span>
    </button>
  )
}

function MiniStat({
  icon: Icon,
  value,
  label,
  tint,
}: {
  icon: typeof Trophy
  value: string | number
  label: string
  tint: string
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 text-center">
      <Icon className="mx-auto size-5" style={{ color: tint }} />
      <p className="mt-1.5 font-display text-xl font-bold leading-none">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}
