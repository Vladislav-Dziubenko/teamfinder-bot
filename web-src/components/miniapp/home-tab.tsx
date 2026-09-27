"use client"

import { useState, useEffect } from "react"
import { Swords, Trophy, Radio, BookOpen, Shield, ArrowUpRight, ArrowRight, Check, RotateCcw, Loader2 } from "lucide-react"
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

// A stable first value prevents the hero badge from flashing a blurred
// skeleton while unrelated home data (quests) is still loading.
let lastSearchCount = 0

export function HomeTab({
  onGo,
  onConnect,
  onToast,
}: {
  onGo: (t: TabId) => void
  onConnect: (p: Player) => void
  onToast: (m: string) => void
}) {
  const { t, tl } = useI18n()
  const { wins, level, nick, streakDay } = useMe()
  const { refresh, bpXp, bpLevel, battlePassTiers } = useNexus()
  const [quests, setQuests] = useState<Quest[]>([])
  const [searchCount, setSearchCount] = useState(lastSearchCount)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [claiming, setClaiming] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function refreshOnline() {
      try {
        const countData = await api.get("/api/online")
        if (!cancelled) {
          const count = Number(countData.online) || 0
          setSearchCount(count)
          lastSearchCount = count
        }
      } catch {}
    }
    async function load() {
      setLoading(true)
      setError(null)
      // Do not make the visible search count wait for quests.  On a cold
      // database the quest endpoint can be noticeably slower.
      void refreshOnline()
      try {
        const questData = await api.get("/api/nexus/quests")
        if (!cancelled) {
          setQuests(questData.quests ?? [])
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.status ? t("common.error") : (e.message || t("common.error")))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    // Число в поиске обновляется почти мгновенно: лёгкий полл раз в 1.5с + рефреш
    // сразу при возврате на вкладку/фокусе окна (игрок зашёл → видим сразу).
    const poll = setInterval(refreshOnline, 1_500)
    const onVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") refreshOnline()
    }
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible)
    if (typeof window !== "undefined") window.addEventListener("focus", refreshOnline)
    return () => {
      cancelled = true
      clearInterval(poll)
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible)
      if (typeof window !== "undefined") window.removeEventListener("focus", refreshOnline)
    }
  }, [t, retry])

  async function claimQuest(q: Quest) {
    if (claiming) return
    setClaiming(q.id)
    try {
      await api.post("/api/nexus/quests/claim", { quest_id: q.id })
      onToast(t("home.quest_claimed", { reward: q.reward }))
      // Не ждём тяжёлый /api/me — помечаем локально сразу, а профиль
      // перезапрашиваем в фоне (звёзды подтянутся чуть позже).
      setQuests((prev) => prev.map((x) => (x.id === q.id ? { ...x, completed: true } : x)))
      refresh().catch(() => {})
    } catch {
      onToast(t("home.quest_not_ready"))
    }
    setClaiming(null)
  }

  const claimable = quests.filter((q) => !q.completed && q.progress >= q.target)
  const [claimingAll, setClaimingAll] = useState(false)

  async function claimAll() {
    if (claimingAll) return
    setClaimingAll(true)
    try {
      const data = await api.post("/api/nexus/quests/claim-all", {})
      const n = data.claimed ?? 0
      const total = data.stars ?? 0
      if (n > 0) {
        onToast(t("home.quest_claimed_all", { count: n, reward: `${total} ⭐` }))
        setQuests((prev) => prev.map((x) => (x.progress >= x.target ? { ...x, completed: true } : x)))
      } else {
        onToast(t("home.quest_not_ready"))
      }
      refresh().catch(() => {})
    } catch {
      onToast(t("home.quest_not_ready"))
    }
    setClaimingAll(false)
  }

  const nextTier = battlePassTiers.find((tier) => tier.xp > bpXp)
  const previousXp = [...battlePassTiers].reverse().find((tier) => tier.xp <= bpXp)?.xp ?? 0
  const passProgress = nextTier ? Math.max(0, Math.min(100, ((bpXp - previousXp) / Math.max(1, nextTier.xp - previousXp)) * 100)) : 100

  return (
    <div className="nexus-home">
      <div className="nexus-home-heading flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="nexus-eyebrow mb-2">TEAMHUB / {t("home.lobby")}</p>
          <h1 className="nexus-page-title">{t("home.ready")}</h1>
          {nick && <p className="mt-2 truncate text-xs text-muted-foreground">{t("home.welcome", { name: nick })}</p>}
        </div>
        <span className="nexus-live"><Radio className="size-3.5 shrink-0" />{t("home.hero_players", { count: searchCount })}</span>
      </div>

      <section className="nexus-match-feature">
        <img src="/hero-arena.webp" alt="" fetchPriority="high" />
        <div>
          <span className="mb-3 block text-[10px] font-semibold text-[#d3f56a]">{t("home.matchmaking")}</span>
          <h2>{t("home.new_hero_title")}</h2>
          <p>{t("home.new_hero_subtitle")}</p>
        </div>
        <div className="nexus-feature-footer">
          <button type="button" onClick={() => onGo("match")} className="nexus-primary-button">
            <Swords className="size-4 shrink-0" />{t("home.hero_cta")}<ArrowUpRight className="size-4 shrink-0" />
          </button>
          <span className="nexus-feature-code">CS2 / DOTA 2 / +8</span>
        </div>
      </section>

      <section className="nexus-overview" aria-label={t("nav.stats")}>
        <MiniStat value={level ?? "—"} label={t("common.level")} />
        <MiniStat value={wins ?? "—"} label={t("stats.wins")} />
        <MiniStat value={streakDay ?? 0} label={t("home.streak")} />
      </section>

      <section className="nexus-home-shortcuts">
        <div className="nexus-section-title"><h2>{t("home.your_hub")}</h2><span className="nexus-eyebrow">NEXUS / 01</span></div>
        <div className="nexus-quicklinks">
          <QuickLink icon={Trophy} label={t("home.stat_battlepass")} tint="var(--stars)" onClick={() => onGo("battlepass")} />
          <QuickLink icon={Shield} label={t("nav.clan")} tint="var(--primary)" onClick={() => onGo("clan")} />
          <QuickLink icon={BookOpen} label={t("home.quick_guides")} tint="var(--accent)" onClick={() => onGo("guides")} />
        </div>
        <button type="button" onClick={() => onGo("battlepass")} className="mt-4 block w-full text-start" aria-label={t("nav.battlepass")}>
          <span className="mb-2 flex items-center justify-between gap-3 text-[11px] text-muted-foreground"><span>{t("home.pass_progress")}</span><span className="font-mono text-foreground">LVL {bpLevel}<ArrowRight className="ms-2 inline size-3" /></span></span>
          <span className="nexus-progress block"><span style={{ width: `${passProgress}%` }} /></span>
        </button>
      </section>

      <div className="nexus-home-event">
        <button type="button" onClick={() => onGo("event")} className="nexus-event">
          <img src="/autumn-hero.webp" alt="" loading="lazy" />
          <div className="min-w-0">
            <span className="text-[10px] font-medium text-stars">{t("home.event_dates")}</span>
            <h2>{t("home.event_title")}</h2>
            <p>{t("home.event_sub")}</p>
          </div>
          <ArrowUpRight className="size-5 text-stars" />
        </button>
      </div>

      <section className="nexus-home-quests">
            <div className="nexus-section-title">
              <h2>{t("home.quest_title")}</h2>
              {claimable.length > 0 && (
                <button
                  type="button"
                  onClick={claimAll}
                  disabled={claimingAll}
                  className="min-h-10 px-2 text-[11px] font-semibold text-primary disabled:opacity-60"
                >
                  {claimingAll ? "..." : t("home.claim_all")}
                </button>
              )}
            </div>
          {loading ? <div className="space-y-3 py-4" aria-busy="true" aria-label={t("common.loading")}><div className="h-3 w-2/3 animate-pulse rounded bg-secondary" /><div className="h-3 w-1/2 animate-pulse rounded bg-secondary" /></div> : error ? (
            <div className="border-t border-border py-4">
              <p role="status" className="text-xs text-muted-foreground">{error}</p>
              <button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-3 flex min-h-10 items-center gap-2 text-xs text-primary"><RotateCcw className="size-4" />{t("home.retry")}</button>
            </div>
          ) : quests.length === 0 ? <p className="py-4 text-xs text-muted-foreground">{t("home.no_quests")}</p> : (
          <div>
          {quests.map((q) => (
            <article key={q.id} className="nexus-quest">
              <div>
                <div className="flex items-start justify-between gap-3"><h3>{tl(`quest.${q.id}.title`, q.title)}</h3>{q.completed && <Check className="size-4 shrink-0 text-primary" />}</div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{tl(`quest.${q.id}.desc`, q.desc)}</p>
                <p className="mt-2 text-[11px] text-stars">{t("home.quest_reward", { reward: q.reward })}</p>
                <div className="mt-3 flex items-center gap-3">
                  <div className="nexus-progress flex-1">
                    <span
                      style={{ width: `${Math.max(0, Math.min(100, (q.progress / Math.max(1, q.target)) * 100))}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-primary">{Math.min(q.progress, q.target)}/{q.target}</span>
                </div>
                {q.completed ? (
                  <span className="mt-3 block text-[11px] text-muted-foreground">
                    {t("common.claimed")}
                  </span>
                ) : q.progress >= q.target ? (
                  <button
                    type="button"
                    onClick={() => claimQuest(q)}
                    disabled={claiming === q.id}
                    className="nexus-primary-button mt-3 w-full disabled:opacity-60"
                  >
                    {claiming === q.id ? <Loader2 className="size-4 animate-spin" /> : t("common.claim")}
                  </button>
                ) : null}
              </div>
            </article>
          ))}
          </div>)}
      </section>
      <div className="nexus-home-discord"><DiscordSection /></div>
    </div>
  )
}

function QuickLink({ icon: Icon, label, tint, onClick }: { icon: typeof Trophy; label: string; tint: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="nexus-quicklink">
      <span className="flex w-full items-center justify-between gap-1"><Icon className="size-5" style={{ color: tint }} /><ArrowUpRight className="size-3.5 text-muted-foreground" /></span>
      <span>{label}</span>
    </button>
  )
}

function MiniStat({ value, label }: { value: string | number; label: string }) {
  return (
    <div>
      <p className="nexus-stat-label">{label}</p>
      <p className="nexus-stat-value">{value}</p>
    </div>
  )
}
