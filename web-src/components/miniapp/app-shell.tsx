"use client"

import { Suspense, lazy, useEffect, useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { NexusProvider } from "@/lib/store"
import { TopBar } from "./top-bar"
import { BottomNav, type TabId } from "./bottom-nav"
import { MoreSheet } from "./more-sheet"
import { HomeTab } from "./home-tab"
import { MatchTab } from "./match-tab"
import { CasesTab } from "./cases-tab"
import { DonateTab } from "./donate-tab"
import { ProfileTab } from "./profile-tab"
import { PromoTab } from "./promo-tab"
import { FriendsTab } from "./friends-tab"
import { ContactSheet } from "./contact-sheet"
import { ProfileViewSheet } from "./profile-view-sheet"
import { ConsentSheet } from "./consent-sheet"
import { BannedSheet } from "./banned-sheet"
import { LeaderboardSheet } from "./leaderboard-sheet"
import { OnboardingSheet, isOnboardingDone, markOnboardingDone } from "./onboarding"
import { openChatWithPlayer, chatIdForPair, getChatPlayer } from "@/lib/chat"
import { api } from "@/lib/api"
import { hapticTap } from "@/lib/webapp"
import { analytics } from "@/lib/telegram-analytics"
import { useMe, useNexus, CONSENT_VERSION } from "@/lib/store"
import type { Player, Team } from "@/lib/data"

// Ленивая загрузка тяжёлых вкладок: Three.js (~600KB), Recharts (~400KB)
// загружаются только при первом открытии, а не в основном бандле.
const ModelTab = lazy(() => import("./model-tab").then((m) => ({ default: m.ModelTab })))
const StatsTab = lazy(() => import("./stats-tab").then((m) => ({ default: m.StatsTab })))
const BattlePassTab = lazy(() => import("./battlepass-tab").then((m) => ({ default: m.BattlePassTab })))
const PredictionsTab = lazy(() => import("./predictions-tab").then((m) => ({ default: m.PredictionsTab })))
const ChatTab = lazy(() => import("./chat-tab").then((m) => ({ default: m.ChatTab })))
const GuidesTab = lazy(() => import("./guides-tab").then((m) => ({ default: m.GuidesTab })))
const ReviewTab = lazy(() => import("./review-tab").then((m) => ({ default: m.ReviewTab })))
const MarketTab = lazy(() => import("./market-tab").then((m) => ({ default: m.MarketTab })))
const SessionTab = lazy(() => import("./session-tab").then((m) => ({ default: m.SessionTab })))

function TabFallback() {
  return (
    <div className="animate-pulse space-y-3 px-4 py-5" aria-busy="true">
      <div className="h-28 rounded-3xl bg-card/70" />
      <div className="h-16 rounded-2xl bg-card/50" />
      <div className="h-16 rounded-2xl bg-card/50" />
      <div className="h-24 rounded-2xl bg-card/70" />
      <div className="h-16 rounded-2xl bg-card/50" />
    </div>
  )
}

function Shell() {
  const { t } = useI18n()
  const me = useMe()
  const { serverBusy, setServerBusy, consentVersion, acceptConsent, loaded, welcomeBonus, banned, banReason, banExpiresAt, refresh } = useNexus()
  const [tab, setTab] = useState<TabId>("home")
  const [moreOpen, setMoreOpen] = useState(false)
  const [contact, setContact] = useState<Player | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [chatOpen, setChatOpen] = useState<{ chatId: string; player: Player } | null>(null)
  const [sharedProfileId, setSharedProfileId] = useState<number | null>(null)
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)
  const [welcomeShown, setWelcomeShown] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null)

  // Показ обучающего онбординга один раз: флаг в localStorage.
  // Читаем в useEffect (не в initial render), чтобы не было SSR-hydration расхождений.
  useEffect(() => {
    if (!loaded || banned || consentVersion < CONSENT_VERSION) return
    setOnboardingDone(isOnboardingDone())
  }, [loaded, banned, consentVersion])

  const finishOnboarding = () => {
    markOnboardingDone()
    setOnboardingDone(true)
  }

  // Приветственный бонус (первый вход): показываем тост с составом награды.
  useEffect(() => {
    if (welcomeBonus && !welcomeShown) {
      setWelcomeShown(true)
      setToast(t("welcome_bonus.toast"))
    }
  }, [welcomeBonus, welcomeShown, t])

  // Auto-recover from server busy: poll /health every 5s, dismiss overlay when OK
  useEffect(() => {
    if (!serverBusy) return
    const iv = setInterval(async () => {
      try {
        const res = await fetch("/health")
        if (res.ok) setServerBusy(false)
      } catch {}
    }, 5000)
    return () => clearInterval(iv)
  }, [serverBusy, setServerBusy])

  useEffect(() => {
    // Предзагрузка ленивых вкладок в фоне — чтобы первый клик открывал их
    // мгновенно (чанки уже скачаны). Тяжёлые (three.js ~600KB) грузим
    // чуть позже, чтобы не конкурировать со стартовой загрузкой /api/me.
    const id = setTimeout(() => {
      Promise.allSettled([
        import("./chat-tab"),
        import("./stats-tab"),
        import("./review-tab"),
        import("./guides-tab"),
        import("./predictions-tab"),
      ])
      setTimeout(() => {
        import("./model-tab").catch(() => {})
        import("./battlepass-tab").catch(() => {})
      }, 1200)
    }, 250)
    return () => clearTimeout(id)
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2400)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    try {
      let id: number | null = null
      let refCode: string | null = null
      let chatDeep: { a: number; b: number } | null = null
      const wa = (window as any).Telegram?.WebApp
      const sp = wa?.initDataUnsafe?.start_param
      if (sp) {
        // deep-link на переписку из Telegram-уведомления: startapp=chat_<a>_<b>
        const m = sp.match(/^chat_(\d+)_(\d+)$/)
        if (m) {
          chatDeep = { a: parseInt(m[1], 10), b: parseInt(m[2], 10) }
        } else if (sp.startsWith("profile_")) {
          id = parseInt(sp.replace("profile_", ""), 10)
        } else {
          refCode = sp
        }
      }
      if (!id) {
        const params = new URLSearchParams(window.location.search)
        const qp = params.get("show_profile")
        if (qp) {
          id = parseInt(qp, 10)
          params.delete("show_profile")
          const newUrl = window.location.pathname + (params.toString() ? "?" + params.toString() : "")
          window.history.replaceState({}, "", newUrl)
        }
      }
      if (chatDeep) {
        const chatId = chatIdForPair(chatDeep.a, chatDeep.b)
        setChatOpen({ chatId, player: (getChatPlayer(chatId) as Player | undefined) ?? ({} as Player) })
        setTab("chat")
      } else if (id && !isNaN(id)) {
        setSharedProfileId(id)
      }
      if (refCode) {
        api.post("/api/referral/claim", { code: refCode }).then(() => {
          setToast("🎉 Ты получил 50⭐ и 50 монет, а пригласивший тебя — мгновенный бонус!")
          refresh()
        }).catch(() => { setToast("❌ Реферальная награда не начислена") })
      }
    } catch {}
  }, [])

  function goTab(t: TabId) {
    setTab(t)
    setMoreOpen(false)
    if (typeof window !== "undefined") window.__NEXUS_TAB = t
    analytics.page(t)
    document.getElementById("miniapp-scroll")?.scrollTo({ top: 0, behavior: "smooth" })
  }

  function joinTeam(team: Team) {
    setToast(t("appshell.toast_team_joined", { team: team.name }))
  }

  function openChat(player: Player) {
    hapticTap()
    setChatOpen({ chatId: openChatWithPlayer(me.userId, player.id), player })
    goTab("chat")
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-background md:shadow-[0_0_90px_-25px_color-mix(in_oklch,var(--primary)_45%,transparent)]">
      <TopBar onStars={() => goTab("donate")} onCoins={() => goTab("cases")} />

      <main id="miniapp-scroll" className="flex-1 overflow-y-auto pb-24">
        {tab === "home" && <HomeTab onGo={goTab} onConnect={setContact} onToast={setToast} />}
        {tab === "match" && <MatchTab onConnect={setContact} onJoinTeam={joinTeam} onChat={openChat} />}
        {tab === "predictions" && <Suspense fallback={<TabFallback />}><PredictionsTab onToast={setToast} /></Suspense>}
        {tab === "chat" && (
          <Suspense fallback={<TabFallback />}><ChatTab openChatId={chatOpen?.chatId ?? null} openPlayer={chatOpen?.player} onOpenConsumed={() => setChatOpen(null)} /></Suspense>
        )}
        {tab === "stats" && <Suspense fallback={<TabFallback />}><StatsTab onOpenLeaderboard={() => setLeaderboardOpen(true)} /></Suspense>}
        {tab === "cases" && <CasesTab onToast={setToast} />}
        {tab === "model" && <Suspense fallback={<TabFallback />}><ModelTab onToast={setToast} /></Suspense>}
        {tab === "battlepass" && <Suspense fallback={<TabFallback />}><BattlePassTab onToast={setToast} /></Suspense>}
        {tab === "promo" && <PromoTab onToast={setToast} />}
        {tab === "guides" && <Suspense fallback={<TabFallback />}><GuidesTab /></Suspense>}
        {tab === "donate" && <DonateTab />}
        {tab === "profile" && <ProfileTab onGo={goTab} onToast={setToast} onGuide={() => setGuideOpen(true)} />}
        {tab === "friends" && <FriendsTab onChat={openChat} />}
        {tab === "review" && <Suspense fallback={<TabFallback />}><ReviewTab onToast={setToast} /></Suspense>}
        {tab === "market" && <Suspense fallback={<TabFallback />}><MarketTab onToast={setToast} /></Suspense>}
        {tab === "sessions" && <Suspense fallback={<TabFallback />}><SessionTab onToast={setToast} /></Suspense>}
      </main>

      <BottomNav active={tab} onChange={goTab} onMore={() => setMoreOpen(true)} />

      <MoreSheet
        open={moreOpen}
        active={tab}
        onSelect={goTab}
        onClose={() => setMoreOpen(false)}
      />

      <ContactSheet player={contact} onClose={() => setContact(null)} />

      <LeaderboardSheet open={leaderboardOpen} onClose={() => setLeaderboardOpen(false)} />

      {/* Бан аккаунта — полный экран поверх приложения, выше онбординга */}
      {loaded && banned && (
        <BannedSheet reason={banReason} expiresAt={banExpiresAt} />
      )}

      {/* Онбординг: политика конфиденциальности и дисклеймер.
          Показывается только если пользователь ещё не принял актуальную
          версию соглашения; решение хранится на сервере. */}
      {loaded && !banned && consentVersion < CONSENT_VERSION && (
        <ConsentSheet onAccept={acceptConsent} />
      )}

      {/* Обучение: показывается после принятия согласия, один раз за устройство.
          Кнопка «Пропустить» доступна на первом шаге. */}
      {loaded && !banned && consentVersion >= CONSENT_VERSION && (guideOpen || onboardingDone === false) && (
        <OnboardingSheet
          onDone={() => {
            finishOnboarding()
            setGuideOpen(false)
          }}
          onSkip={() => {
            finishOnboarding()
            setGuideOpen(false)
          }}
        />
      )}

      {sharedProfileId && (
        <ProfileViewSheet
          userId={sharedProfileId}
          onClose={() => setSharedProfileId(null)}
          onChat={(id, nick, avatar) => {
            setChatOpen({
              chatId: openChatWithPlayer(me.userId, String(id)),
              player: { id: String(id), nick, realName: nick, avatar: avatar ?? "", game: "", rank: "", role: "", kd: 0, winrate: 0, hours: 0, online: false, tags: [], bio: "", tgUsername: "", vibe: 0 },
            })
            goTab("chat")
            setSharedProfileId(null)
          }}
        />
      )}

      {/* Server busy full-screen overlay */}
      {serverBusy && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-border bg-card p-8 text-center shadow-2xl">
            <Loader2 className="size-10 animate-spin text-primary" />
            <h2 className="font-display text-xl font-bold">{t("server_busy.title")}</h2>
            <p className="max-w-xs text-sm text-muted-foreground">{t("server_busy.desc")}</p>
            <p className="text-xs text-muted-foreground">{t("server_busy.retry_hint")}</p>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-0 top-16 z-[60] mx-auto flex max-w-md justify-center px-4">
          <div className="flex items-center gap-2 rounded-2xl border border-accent/40 bg-card px-4 py-3 text-sm font-medium shadow-lg animate-rise">
            <span className="grid size-6 place-items-center rounded-full bg-accent text-accent-foreground">
              <Check className="size-3.5" />
            </span>
            {toast}
          </div>
        </div>
      )}
    </div>
  )
}

export function AppShell() {
  return (
    <NexusProvider>
      <Shell />
    </NexusProvider>
  )
}
