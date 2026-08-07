"use client"

import { Ban, ShieldOff, Send } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { useNexus } from "@/lib/store"
import { openTelegramLink } from "@/lib/api"

export function BannedSheet({ reason, expiresAt }: { reason?: string; expiresAt?: string }) {
  const { t, lang } = useI18n()
  const { referralBotUrl } = useNexus()

  const botLink = (referralBotUrl || "https://t.me/NexusTeammatesBot").replace(/\/$/, "") + "?start=appeal"

  let until = ""
  if (expiresAt) {
    const ts = Date.parse(expiresAt)
    if (!isNaN(ts)) {
      try {
        until = new Date(ts).toLocaleString(lang, {
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
        })
      } catch {
        until = new Date(ts).toLocaleString()
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex flex-col overflow-y-auto bg-background">
      {/* Тёмная градиентная шапка */}
      <div className="relative shrink-0 overflow-hidden bg-gradient-to-b from-red-600/25 via-accent/10 to-background px-6 pb-10 pt-14 text-center">
        <div className="pointer-events-none absolute -top-10 left-1/2 h-44 w-72 -translate-x-1/2 rounded-full bg-red-500/30 blur-3xl" />
        <div className="relative mx-auto grid size-16 place-items-center rounded-3xl bg-gradient-to-br from-red-500 to-red-700 shadow-[0_10px_40px_-10px_rgba(239,68,68,0.8)]">
          <Ban className="size-8 text-white" />
        </div>
        <h1 className="relative mt-4 font-display text-2xl font-bold">{t("ban.title")}</h1>
        <p className="relative mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">{t("ban.subtitle")}</p>
      </div>

      <div className="flex-1 space-y-4 px-5 pb-8">
        <div className="rounded-3xl border border-red-500/25 bg-card p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-red-500/15 text-red-500">
              <ShieldOff className="size-5" />
            </span>
            <h2 className="font-display text-base font-bold">{t("ban.reason_title")}</h2>
          </div>
          <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground">
            {reason ? `${t("ban.reason_label")}: ${reason}` : t("ban.no_reason")}
          </p>
        </div>

        <div className="rounded-3xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-foreground">{t("ban.expires_title")}</span>
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-foreground">
            {until ? `${t("ban.expires_until")} ${until}` : t("ban.expires_forever")}
          </p>
        </div>

        <div className="rounded-3xl border border-border bg-card p-4">
          <p className="text-[13px] leading-relaxed text-muted-foreground">{t("ban.appeal")}</p>
          <button
            type="button"
            onClick={() => openTelegramLink(botLink)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-accent py-3.5 text-sm font-bold text-primary-foreground shadow-[0_10px_30px_-10px_rgba(124,58,237,0.7)] transition-transform active:scale-[0.98]"
          >
            <Send className="size-4" />
            {t("ban.appeal_btn")}
          </button>
          <p className="mt-2 text-center text-[10px] text-muted-foreground/70">{t("ban.appeal_hint")}</p>
        </div>
      </div>
    </div>
  )
}
