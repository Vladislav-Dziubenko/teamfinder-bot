"use client"

import { useState, useEffect } from "react"
import { Swords, Flame, Trophy, Radio, BookOpen, Ticket } from "lucide-react"
import { api } from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { useMe, useNexus } from "@/lib/store"
import type { TabId } from "./bottom-nav"
import type { Player } from "@/lib/data"
import { DiscordSection } from "@/components/miniapp/discord-section"

type Quest = {
  id: string
  title: string
  desc: string
  reward: string
  progress: number
  target: number
  completed: boolean
}

export function HomeTab({
  onGo,
  onConnect,
}: {
  onGo: (t: TabId) => void
  onConnect: (p: Player) => void
}) {
  const { t } = useI18n()
  const { wins, level } = useMe()
  const refresh = useNexus().refresh
  const [quests, setQuests] = useState<Quest[]>([])
  const [searchCount, setSearchCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [claiming, setClaiming] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [questData, countData] = await Promise.all([
          api.get("/api/nexus/quests"),
          api.get("/api/online"),
        ])
        if (!cancelled) {
          setQuests(questData.quests ?? [])
          setSearchCount(countData.online ?? 0)
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || t("common.error"))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  async function claimQuest(q: Quest) {
    if (claiming) return
    setClaiming(q.id)
    try {
      await api.post("/api/nexus/quests/claim", { quest_id: q.id })
      await refresh()
      setQuests((prev) => prev.map((x) => (x.id === q.id ? { ...x, completed: true } : x)))
    } catch {}
    setClaiming(null)
  }

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
      <section className="animate-rise relative overflow-hidden rounded-3xl border border-border">
        <img src="/hero-arena.png" alt="" className="h-52 w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/10" />
        <div className="absolute inset-x-0 bottom-0 p-5">
          <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent">
            <Radio className="size-3" /> {t("home.hero_players", { count: searchCount ?? "—" })}
          </span>
          <h1 className="font-display text-3xl font-bold leading-none text-balance text-glow-primary">
            {t("home.hero_title")}
          </h1>
          <p className="mt-1.5 max-w-[16rem] text-sm text-muted-foreground text-pretty">
            {t("home.hero_subtitle")}
          </p>
          <button
            type="button"
            onClick={() => onGo("match")}
            className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)] transition-transform active:scale-95"
          >
            <Swords className="size-4" /> {t("home.hero_cta")}
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <MiniStat icon={Trophy} value={wins ?? "—"} label={t("stats.wins")} tint="var(--primary)" />
        <MiniStat icon={Flame} value={level ? `LVL ${level}` : "—"} label={t("common.level")} tint="var(--stars)" />
      </section>

      <section className="grid grid-cols-3 gap-3">
        <QuickLink icon={Trophy} label={t("home.stat_battlepass")} tint="var(--stars)" onClick={() => onGo("battlepass")} />
        <QuickLink icon={Ticket} label={t("home.quick_promo")} tint="var(--primary)" onClick={() => onGo("promo")} />
        <QuickLink icon={BookOpen} label={t("home.quick_guides")} tint="var(--accent)" onClick={() => onGo("guides")} />
      </section>

      <DiscordSection />

      {loading ? (
        <section className="flex items-center justify-center rounded-3xl border border-border p-10">
          <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </section>
      ) : quests.length > 0 ? (
        <div className="space-y-3">
          <span className="text-xs font-medium uppercase tracking-widest text-primary">{t("home.quest_title")}</span>
          {quests.map((q) => (
            <section key={q.id} className={`relative overflow-hidden rounded-3xl border p-5 ${q.completed ? "border-stars/40 bg-stars/5" : "border-primary/30 bg-primary/5"}`}>
              <div className="relative z-10">
                <p className="font-display text-base font-bold text-balance">{q.title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{q.desc}</p>
                <p className="mt-1 text-xs text-primary">{t("home.quest_reward", { reward: q.reward })}</p>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.min(100, (q.progress / q.target) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-primary">{q.progress}/{q.target}</span>
                </div>
                {q.completed ? (
                  <span className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-secondary py-2.5 text-sm font-bold text-muted-foreground">
                    ✓ {t("common.claimed")}
                  </span>
                ) : q.progress >= q.target ? (
                  <button
                    type="button"
                    onClick={() => claimQuest(q)}
                    disabled={claiming === q.id}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-stars py-2.5 text-sm font-bold text-background active:scale-[0.98] disabled:opacity-60"
                  >
                    {claiming === q.id ? "..." : t("common.claim")}
                  </button>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function QuickLink({ icon: Icon, label, tint, onClick }: { icon: typeof Trophy; label: string; tint: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-card p-3 text-center active:scale-95">
      <span className="grid size-9 place-items-center rounded-xl" style={{ background: `color-mix(in oklch, ${tint} 15%, transparent)` }}>
        <Icon className="size-5" style={{ color: tint }} />
      </span>
      <span className="text-[11px] font-semibold">{label}</span>
    </button>
  )
}

function MiniStat({ icon: Icon, value, label, tint }: { icon: typeof Trophy; value: string | number; label: string; tint: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 text-center">
      <Icon className="mx-auto size-5" style={{ color: tint }} />
      <p className="mt-1.5 font-display text-xl font-bold leading-none">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}
