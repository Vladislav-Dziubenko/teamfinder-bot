"use client"

import { useEffect, useState } from "react"
import { Swords, Flame, Coins, Star, ChevronRight, Radio, BookOpen, Ticket, Loader2 } from "lucide-react"
import { api } from "@/lib/api"
import { useNexus } from "@/lib/store"
import type { TabId } from "./bottom-nav"

export function HomeTab({
  onGo,
  onConnect,
}: {
  onGo: (t: TabId) => void
  onConnect: (p: any) => void
}) {
  const [searchCount, setSearchCount] = useState<number | null>(null)
  const [quest, setQuest] = useState<{ title: string; desc: string; reward: number; progress?: number; target?: number } | null>(null)
  const { coins, stars, bpLevel, freeSearchesLeft } = useNexus()

  useEffect(() => {
    let cancelled = false
    api.get("/api/search/count").then((d) => {
      if (!cancelled) setSearchCount(d.count ?? 0)
    }).catch(() => {
      if (!cancelled) setSearchCount(0)
    })
    api.get("/api/nexus/quests").then((d) => {
      if (!cancelled && d.quests?.length) {
        const q = d.quests[0]
        const p = d.progress?.[q.id] ?? 0
        setQuest({
          title: q.title,
          desc: q.desc,
          reward: q.reward,
          progress: p,
          target: q.targetMinutes,
        })
      }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  return (
    <div className="space-y-6 px-4 py-5">
      {/* Hero */}
      <section className="animate-rise relative overflow-hidden rounded-3xl border border-border">
        <img src="/hero-arena.png" alt="" className="h-52 w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/10" />
        <div className="absolute inset-x-0 bottom-0 p-5">
          <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent">
            <Radio className="size-3" /> {searchCount !== null ? `${searchCount} игроков в поиске` : "..."}
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
      <section className="grid grid-cols-3 gap-3">
        <MiniStat icon={Coins} value={coins} label="Монет" tint="var(--stars)" />
        <MiniStat icon={Star} value={stars} label="Звёзд" tint="var(--primary)" />
        <MiniStat icon={Flame} value={`LVL ${bpLevel}`} label="Батл-пасс" tint="var(--accent)" />
      </section>

      {/* Quick access */}
      <section className="grid grid-cols-3 gap-3">
        <QuickLink icon={Swords} label="Поиск" tint="var(--primary)" onClick={() => onGo("match")} />
        <QuickLink icon={Ticket} label="Промокоды" tint="var(--primary)" onClick={() => onGo("promo")} />
        <QuickLink icon={BookOpen} label="Гайды" tint="var(--accent)" onClick={() => onGo("guides")} />
      </section>

      {/* Daily quest */}
      {quest && (
        <section className="animate-scan relative overflow-hidden rounded-3xl border border-primary/30 bg-primary/5 p-5">
          <div className="relative z-10">
            <span className="text-xs font-medium uppercase tracking-widest text-primary">Задание дня</span>
            <p className="mt-1 font-display text-xl font-bold text-balance">{quest.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{quest.desc}</p>
            <p className="mt-1 text-xs text-muted-foreground">Награда: {quest.reward} ⭐</p>
            {quest.target && (
              <div className="mt-3 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, ((quest.progress ?? 0) / quest.target) * 100)}%` }} />
                </div>
                <span className="text-xs font-semibold text-primary">{quest.progress ?? 0}/{quest.target} мин</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Free searches remaining */}
      <section className="rounded-2xl border border-border bg-card p-4 text-center">
        <p className="text-sm text-muted-foreground">
          Осталось бесплатных поисков: <span className="font-bold text-foreground">{freeSearchesLeft}</span>
        </p>
      </section>
    </div>
  )
}

function QuickLink({
  icon: Icon,
  label,
  tint,
  onClick,
}: {
  icon: typeof Swords
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
      <span className="grid size-9 place-items-center rounded-xl" style={{ background: `color-mix(in oklch, ${tint} 15%, transparent)` }}>
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
  icon: typeof Coins
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
