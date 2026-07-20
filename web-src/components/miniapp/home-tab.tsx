"use client"

import { Swords, Flame, Users2, Trophy, ChevronRight, Radio, BookOpen, Ticket } from "lucide-react"
import { players, currentUser } from "@/lib/data"
import type { TabId } from "./bottom-nav"
import type { Player } from "@/lib/data"

export function HomeTab({
  onGo,
  onConnect,
}: {
  onGo: (t: TabId) => void
  onConnect: (p: Player) => void
}) {
  const onlineNow = players.filter((p) => p.online)

  return (
    <div className="space-y-6 px-4 py-5">
      {/* Hero */}
      <section className="animate-rise relative overflow-hidden rounded-3xl border border-border">
        <img src="/hero-arena.png" alt="" className="h-52 w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/10" />
        <div className="absolute inset-x-0 bottom-0 p-5">
          <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent">
            <Radio className="size-3" /> {onlineNow.length * 1287 + 412} игроков в поиске
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
        <MiniStat icon={Trophy} value={currentUser.wins} label="Побед" tint="var(--primary)" />
        <MiniStat icon={Users2} value={currentUser.friends} label="Тиммейтов" tint="var(--accent)" />
        <MiniStat icon={Flame} value={`LVL ${currentUser.level}`} label="Уровень" tint="var(--stars)" />
      </section>

      {/* Quick access */}
      <section className="grid grid-cols-3 gap-3">
        <QuickLink icon={Trophy} label="Батл-пасс" tint="var(--stars)" onClick={() => onGo("battlepass")} />
        <QuickLink icon={Ticket} label="Промокоды" tint="var(--primary)" onClick={() => onGo("promo")} />
        <QuickLink icon={BookOpen} label="Гайды" tint="var(--accent)" onClick={() => onGo("guides")} />
      </section>

      {/* Online now */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">В сети сейчас</h2>
          <button
            type="button"
            onClick={() => onGo("match")}
            className="flex items-center gap-0.5 text-xs font-medium text-primary"
          >
            все <ChevronRight className="size-3.5" />
          </button>
        </div>
        <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
          {onlineNow.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onConnect(p)}
              className="animate-rise w-36 shrink-0 overflow-hidden rounded-2xl border border-border bg-card text-left"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="relative">
                <img src={p.avatar || "/placeholder.svg"} alt={p.nick} className="h-28 w-full object-cover" />
                <span className="absolute left-2 top-2 size-2.5 rounded-full bg-accent ring-2 ring-card animate-pulse-ring" />
                <span className="absolute right-2 top-2 rounded bg-primary/90 px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                  {p.vibe}%
                </span>
              </div>
              <div className="p-2.5">
                <p className="truncate font-display text-sm font-bold">{p.nick}</p>
                <p className="truncate text-[11px] text-muted-foreground">{p.rank}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Daily challenge — прикол */}
      <section className="animate-scan relative overflow-hidden rounded-3xl border border-primary/30 bg-primary/5 p-5">
        <div className="relative z-10">
          <span className="text-xs font-medium uppercase tracking-widest text-primary">Задание дня</span>
          <p className="mt-1 font-display text-xl font-bold text-balance">
            Сыграй 3 катки с новым тиммейтом
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Награда: 50 звёзд ⭐ и значок «Командный игрок»</p>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
              <div className="h-full w-1/3 rounded-full bg-primary" />
            </div>
            <span className="text-xs font-semibold text-primary">1/3</span>
          </div>
        </div>
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
