"use client"

import { useEffect, useState } from "react"
import { Check } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { NexusProvider } from "@/lib/store"
import { TopBar } from "./top-bar"
import { BottomNav, type TabId } from "./bottom-nav"
import { HomeTab } from "./home-tab"
import { MatchTab } from "./match-tab"
import { CasesTab } from "./cases-tab"
import { GuidesTab } from "./guides-tab"
import { DonateTab } from "./donate-tab"
import { ProfileTab } from "./profile-tab"
import { BattlePassTab } from "./battlepass-tab"
import { PromoTab } from "./promo-tab"
import { StatsTab } from "./stats-tab"
import { ChatTab } from "./chat-tab"
import { PredictionsTab } from "./predictions-tab"
import { FriendsTab } from "./friends-tab"
import { ContactSheet } from "./contact-sheet"
import { ProfileViewSheet } from "./profile-view-sheet"
import { openChatWithPlayer } from "@/lib/chat"
import type { Player, Team } from "@/lib/data"

function Shell() {
  const { t } = useI18n()
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
      const wa = (window as any).Telegram?.WebApp
      const sp = wa?.initDataUnsafe?.start_param
      if (sp && sp.startsWith("profile_")) {
        id = parseInt(sp.replace("profile_", ""), 10)
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
    setChatOpen({ chatId: openChatWithPlayer(player.id), player })
    goTab("chat")
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-background">
      <TopBar onStars={() => goTab("donate")} onCoins={() => goTab("cases")} />

      <main id="miniapp-scroll" className="flex-1 overflow-y-auto pb-24">
        {tab === "home" && <HomeTab onGo={goTab} onConnect={setContact} />}
        {tab === "match" && <MatchTab onConnect={setContact} onJoinTeam={joinTeam} onChat={openChat} />}
        {tab === "predictions" && <PredictionsTab onToast={setToast} />}
        {tab === "chat" && (
          <ChatTab openChatId={chatOpen?.chatId ?? null} openPlayer={chatOpen?.player} onOpenConsumed={() => setChatOpen(null)} />
        )}
        {tab === "stats" && <StatsTab onOpenLeaderboard={() => setToast(t("stats.leaderboard_placeholder"))} />}
        {tab === "cases" && <CasesTab onToast={setToast} />}
        {tab === "battlepass" && <BattlePassTab onToast={setToast} />}
        {tab === "promo" && <PromoTab onToast={setToast} />}
        {tab === "guides" && <GuidesTab />}
        {tab === "donate" && <DonateTab />}
        {tab === "profile" && <ProfileTab onGo={goTab} onToast={setToast} />}
        {tab === "friends" && <FriendsTab onChat={openChat} />}
      </main>

      <BottomNav active={tab} onChange={goTab} />

      <ContactSheet player={contact} onClose={() => setContact(null)} />

      {sharedProfileId && (
        <ProfileViewSheet
          userId={sharedProfileId}
          onClose={() => setSharedProfileId(null)}
          onChat={(id, nick, avatar) => {
            setChatOpen({
              chatId: openChatWithPlayer(String(id)),
              player: { id, nick, avatar, game: "", rank: "", role: "", kd: 0, winrate: 0, hours: 0, online: false, tags: [], bio: "", tgUsername: "", vibe: 0, locked: false },
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
