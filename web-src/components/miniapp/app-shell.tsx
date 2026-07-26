"use client"

import { useEffect, useState } from "react"
import { Check, Smartphone } from "lucide-react"
import { I18nProvider, useI18n } from "@/lib/i18n"
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
import { ContactSheet } from "./contact-sheet"
import { openChatWithPlayer } from "@/lib/chat"
import type { Player, Team } from "@/lib/data"

function Shell() {
  const { t } = useI18n()
  const [tab, setTab] = useState<TabId>("home")
  const [contact, setContact] = useState<Player | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [chatOpenId, setChatOpenId] = useState<string | null>(null)
  const [initDataOk, setInitDataOk] = useState<boolean | null>(null)

  useEffect(() => {
    setInitDataOk(!!(typeof window !== "undefined" && window.Telegram?.WebApp?.initData))
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2400)
    return () => clearTimeout(t)
  }, [toast])

  function goTab(t: TabId) {
    setTab(t)
    document.getElementById("miniapp-scroll")?.scrollTo({ top: 0, behavior: "smooth" })
  }

  function joinTeam(team: Team) {
    setToast(`Заявка в «${team.name}» отправлена! 🚀`)
  }

  function openChat(player: Player) {
    const id = openChatWithPlayer(player.id)
    setChatOpenId(id)
    goTab("chat")
  }

  if (initDataOk === false) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center bg-background px-8 text-center">
        <Smartphone className="mb-4 size-16 text-muted-foreground" />
        <h1 className="font-display text-2xl font-bold">{t("appshell.not_available_title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("appshell.not_available_desc")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("appshell.not_available_hint")}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-background">
      <TopBar onStars={() => goTab("donate")} onCoins={() => goTab("cases")} />

      <main id="miniapp-scroll" className="flex-1 overflow-y-auto pb-24">
        {tab === "home" && <HomeTab onGo={goTab} onConnect={setContact} />}
        {tab === "match" && <MatchTab onConnect={setContact} onJoinTeam={joinTeam} onChat={openChat} />}
        {tab === "predictions" && <PredictionsTab onToast={setToast} />}
        {tab === "chat" && (
          <ChatTab openChatId={chatOpenId} onOpenConsumed={() => setChatOpenId(null)} />
        )}
        {tab === "stats" && <StatsTab onOpenLeaderboard={() => setToast("Полный рейтинг скоро появится 🏆")} />}
        {tab === "cases" && <CasesTab onToast={setToast} />}
        {tab === "battlepass" && <BattlePassTab onToast={setToast} />}
        {tab === "promo" && <PromoTab onToast={setToast} />}
        {tab === "guides" && <GuidesTab />}
        {tab === "donate" && <DonateTab />}
        {tab === "profile" && <ProfileTab onGo={goTab} onToast={setToast} />}
      </main>

      <BottomNav active={tab} onChange={goTab} />

      <ContactSheet player={contact} onClose={() => setContact(null)} onOpenChat={(chatId) => { goTab("chat"); setChatId(chatId) }} />

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
      <I18nProvider>
        <Shell />
      </I18nProvider>
    </NexusProvider>
  )
}
