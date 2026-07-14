
"use client"

import { useEffect, useState, useCallback } from "react"
import { Check } from "lucide-react"
import { NexusProvider } from "@/lib/store"
import { TopBar } from "./top-bar"
import { BottomNav, type TabId } from "./bottom-nav"
import { HomeTab } from "./home-tab"
import { MatchTab } from "./match-tab"
import { CasesTab } from "./cases-tab"
import { GuidesTab } from "./guides-tab"
import { DonateTab } from "./donate-tab"
import { ProfileTab } from "./profile-tab"
import { ContactSheet } from "./contact-sheet"
import { api, getTelegram, type GamesResponse, type MeResponse, type MatchResult } from "@/lib/api"

function Shell() {
  const [tab, setTab] = useState<TabId>("home")
  const [contact, setContact] = useState<MatchResult | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [games, setGames] = useState<GamesResponse | null>(null)
  const [me, setMe] = useState<MeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshMe = useCallback(async () => {
    try {
      const meData = await api.me()
      setMe(meData)
    } catch (e) {
      // no-op — покажем баннер ошибки только при первой загрузке
    }
  }, [])

  useEffect(() => {
    const tg = getTelegram()
    tg?.ready()
    tg?.expand()

    function applyTheme() {
      const root = document.documentElement
      const params = tg?.themeParams || {}
      Object.entries(params).forEach(([key, value]) => {
        root.style.setProperty(`--tg-theme-${key.replace(/_/g, "-")}`, value as string)
      })
    }
    applyTheme()
    tg?.onEvent("themeChanged", applyTheme)

    async function boot() {
      try {
        const [gamesData, meData] = await Promise.all([api.games(), api.me()])
        setGames(gamesData)
        setMe(meData)
      } catch (e: any) {
        setError(e.message || "Не удалось загрузить данные")
      } finally {
        setLoading(false)
      }
    }
    boot()
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

  function showToast(msg: string) {
    setToast(msg)
  }

  if (loading) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center bg-background text-muted-foreground">
        Загрузка…
      </div>
    )
  }

  if (error || !games) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 bg-background px-6 text-center text-muted-foreground">
        <p>Не получилось загрузить приложение: {error}</p>
        <p className="text-xs">Открой это окно через кнопку в боте — вне Telegram оно не работает.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-background">
      <TopBar onStars={() => goTab("donate")} onCoins={() => goTab("cases")} premium={me?.premium ?? false} />

      <main id="miniapp-scroll" className="flex-1 overflow-y-auto pb-24">
        {tab === "home" && (
          <HomeTab games={games} me={me} onGo={goTab} onConnect={setContact} />
        )}
        {tab === "match" && (
          <MatchTab games={games} me={me} onConnect={setContact} onGo={goTab} onRefreshMe={refreshMe} />
        )}
        {tab === "cases" && <CasesTab onToast={showToast} />}
        {tab === "guides" && <GuidesTab games={games} onToast={showToast} />}
        {tab === "donate" && <DonateTab me={me} onPaid={refreshMe} onToast={showToast} />}
        {tab === "profile" && <ProfileTab games={games} me={me} onSaved={refreshMe} />}
      </main>

      <BottomNav active={tab} onChange={goTab} />

      <ContactSheet player={contact} onClose={() => setContact(null)} onToast={showToast} />

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
