"use client"

import { Suspense, lazy, useEffect, useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { NexusProvider } from "@/lib/store"
import { TopBar } from "./top-bar"
import { BottomNav, type TabId } from "./bottom-nav"
import { HomeTab } from "./home-tab"
import { MatchTab } from "./match-tab"
import { CasesTab } from "./cases-tab"
import { DonateTab } from "./donate-tab"
import { ProfileTab } from "./profile-tab"
import { PromoTab } from "./promo-tab"
import { FriendsTab } from "./friends-tab"
import { ContactSheet } from "./contact-sheet"
import { ProfileViewSheet } from "./profile-view-sheet"
import { openChatWithPlayer } from "@/lib/chat"
import { api } from "@/lib/api"
import { useMe } from "@/lib/store"
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

function TabFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  )
}

function Shell() {
  const { t } = useI18n()
  const me = useMe()
  const [tab, setTab] = useState<TabId>("home")
  const [contact, setContact] = useState<Player | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [chatOpen, setChatOpen] = useState<{ chatId: string; player: Player } | null>(null)
  const [sharedProfileId, setSharedProfileId] = useState<number | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2400)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    try {
      let id: number | null = null
      let refCode: string | null = null
      const wa = (window as any).Telegram?.WebApp
      const sp = wa?.initDataUnsafe?.start_param
      if (sp) {
        if (sp.startsWith("profile_")) {
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
      if (id && !isNaN(id)) setSharedProfileId(id)
      if (refCode) {
        api.post("/api/referral/claim", { code: refCode }).then(() => {
          setToast("🎉 Реферальная награда получена!")
        }).catch(() => { setToast("❌ Реферальная награда не начислена") })
      }
    } catch {}
  }, [])

  function goTab(t: TabId) {
    setTab(t)
    if (typeof window !== "undefined") window.__NEXUS_TAB = t
    document.getElementById("miniapp-scroll")?.scrollTo({ top: 0, behavior: "smooth" })
  }

  function joinTeam(team: Team) {
    setToast(t("appshell.toast_team_joined", { team: team.name }))
  }

  function openChat(player: Player) {
    setChatOpen({ chatId: openChatWithPlayer(me.userId, player.id), player })
    goTab("chat")
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-background">
      <TopBar onStars={() => goTab("donate")} onCoins={() => goTab("cases")} />

      <main id="miniapp-scroll" className="flex-1 overflow-y-auto pb-24">
        {tab === "home" && <HomeTab onGo={goTab} onConnect={setContact} />}
        {tab === "match" && <MatchTab onConnect={setContact} onJoinTeam={joinTeam} onChat={openChat} />}
        {tab === "predictions" && <Suspense fallback={<TabFallback />}><PredictionsTab onToast={setToast} /></Suspense>}
        {tab === "chat" && (
          <Suspense fallback={<TabFallback />}><ChatTab openChatId={chatOpen?.chatId ?? null} openPlayer={chatOpen?.player} onOpenConsumed={() => setChatOpen(null)} /></Suspense>
        )}
        {tab === "stats" && <Suspense fallback={<TabFallback />}><StatsTab onOpenLeaderboard={() => setToast(t("stats.leaderboard_placeholder"))} /></Suspense>}
        {tab === "cases" && <CasesTab onToast={setToast} />}
        {tab === "model" && <Suspense fallback={<TabFallback />}><ModelTab onToast={setToast} /></Suspense>}
        {tab === "battlepass" && <Suspense fallback={<TabFallback />}><BattlePassTab onToast={setToast} /></Suspense>}
        {tab === "promo" && <PromoTab onToast={setToast} />}
        {tab === "guides" && <Suspense fallback={<TabFallback />}><GuidesTab /></Suspense>}
        {tab === "donate" && <DonateTab />}
        {tab === "profile" && <ProfileTab onGo={goTab} onToast={setToast} />}
        {tab === "friends" && <FriendsTab onChat={openChat} />}
        {tab === "review" && <Suspense fallback={<TabFallback />}><ReviewTab onToast={setToast} /></Suspense>}
      </main>

      <BottomNav active={tab} onChange={goTab} />

      <ContactSheet player={contact} onClose={() => setContact(null)} />

      {sharedProfileId && (
        <ProfileViewSheet
          userId={sharedProfileId}
          onClose={() => setSharedProfileId(null)}
          onChat={(id, nick, avatar) => {
            setChatOpen({
              chatId: openChatWithPlayer(me.userId, String(id)),
              player: { id: String(id), nick, avatar, game: "", rank: "", role: "", kd: 0, winrate: 0, hours: 0, online: false, tags: [], bio: "", tgUsername: "", vibe: 0 },
            })
            goTab("chat")
            setSharedProfileId(null)
          }}
        />
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
