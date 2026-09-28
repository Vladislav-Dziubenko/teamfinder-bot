"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowUpRight, Check, Gift, Heart, Loader2, Users } from "lucide-react"
import { useNexus } from "@/lib/store"
import { useI18n } from "@/lib/i18n"
import { hapticNotify } from "@/lib/webapp"
import type { TabId } from "./bottom-nav"

export function HomeActions({ onGo, onToast }: { onGo: (tab: TabId) => void; onToast: (message: string) => void }) {
  const { t } = useI18n()
  const { loaded, lastStreakAt, claimDailyStreak } = useNexus()
  const [now, setNow] = useState(0)
  const [claiming, setClaiming] = useState(false)
  const pending = useRef(false)
  useEffect(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  const ready = loaded && now > 0 && (!lastStreakAt || now - lastStreakAt >= 86_400_000)

  async function claim() {
    if (!ready || pending.current) return
    pending.current = true
    setClaiming(true)
    try {
      const result = await claimDailyStreak()
      hapticNotify(result.ok ? "success" : "error")
      onToast(result.ok ? t("home.daily_received", { coins: result.coins ?? 0 }) : result.error || t("common.error"))
    } catch {
      onToast(t("common.error"))
    } finally {
      pending.current = false
      setClaiming(false)
    }
  }

  return (
    <section className="nexus-home-actions" aria-label={t("home.today")}>
      <button type="button" className="nexus-home-action" onClick={claim} disabled={!ready || claiming}>
        <Gift className="size-5 text-stars" />
        <span><strong>{!loaded || !now ? t("common.loading") : ready ? t("profile.streak_claim") : t("profile.streak_claimed")}</strong><small>{t("home.daily_hint")}</small></span>
        {claiming ? <Loader2 className="size-4 animate-spin" /> : loaded && now > 0 && !ready ? <Check className="size-4 text-primary" /> : <ArrowUpRight className="size-4 text-stars" />}
      </button>
      <button type="button" className="nexus-home-action" onClick={() => onGo("profile")}>
        <Users className="size-5 text-accent" />
        <span><strong>{t("home.squad_title")}</strong><small>{t("home.squad_hint")}</small></span>
        <ArrowUpRight className="size-4 text-muted-foreground" />
      </button>
      <button type="button" className="nexus-home-action" onClick={() => onGo("donate")}>
        <Heart className="size-5 text-primary" />
        <span><strong>{t("home.support_title")}</strong><small>{t("home.support_hint")}</small></span>
        <ArrowUpRight className="size-4 text-muted-foreground" />
      </button>
    </section>
  )
}
