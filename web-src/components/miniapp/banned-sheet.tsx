"use client"

import { useState } from "react"
import { Ban, Loader2, ShieldOff, Send } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { api } from "@/lib/api"

export function BannedSheet({ reason, expiresAt }: { reason?: string; expiresAt?: string }) {
  const { t, lang } = useI18n()
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<"" | "ok" | "error">("")

  async function sendAppeal() {
    if (sending || message.trim().length < 3) return
    setSending(true)
    setResult("")
    try {
      await api.post("/api/support/appeal", { message: message.trim() })
      setMessage("")
      setResult("ok")
    } catch {
      setResult("error")
    } finally {
      setSending(false)
    }
  }

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
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value.slice(0, 1000))}
            rows={4}
            maxLength={1000}
            placeholder={lang === "ru" ? "Опишите, почему блокировка должна быть пересмотрена…" : "Explain why the block should be reviewed…"}
            className="mt-3 w-full resize-none rounded-2xl border border-input bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
          />
          <button
            type="button"
            onClick={sendAppeal}
            disabled={sending || message.trim().length < 3}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-accent py-3.5 text-sm font-bold text-primary-foreground shadow-[0_10px_30px_-10px_rgba(124,58,237,0.7)] transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {t("ban.appeal_btn")}
          </button>
          {result === "ok" && <p className="mt-2 text-center text-xs font-semibold text-emerald-400">{lang === "ru" ? "Тикет отправлен модерации." : "Ticket sent to moderation."}</p>}
          {result === "error" && <p className="mt-2 text-center text-xs font-semibold text-destructive">{lang === "ru" ? "Не удалось отправить. Попробуйте через несколько минут." : "Could not send. Try again shortly."}</p>}
          <p className="mt-2 text-center text-[10px] text-muted-foreground/70">{t("ban.appeal_hint")}</p>
        </div>
      </div>
    </div>
  )
}
