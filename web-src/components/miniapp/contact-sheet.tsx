"use client"

import { useState } from "react"
import { X, Send, MessageCircle, UserPlus, Check } from "lucide-react"
import type { Player } from "@/lib/data"
import { openChatWithPlayer } from "@/lib/chat"
import { api } from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export function ContactSheet({
  player,
  onClose,
  onOpenChat,
}: {
  player: Player | null
  onClose: () => void
  onOpenChat?: (chatId: string) => void
}) {
  const { t } = useI18n()
  const [invited, setInvited] = useState(false)
  const [message, setMessage] = useState("")
  const [sent, setSent] = useState(false)
  const [inviteErr, setInviteErr] = useState<string | null>(null)

  if (!player) return null

  function doSend() {
    const chatId = openChatWithPlayer(player.id)
    setSent(true)
    onOpenChat?.(chatId)
  }

  async function doInvite() {
    setInvited(true)
    try {
      await api.post("/api/teams", {
        game: player.game,
        name: `Приглашение от ${player.nick}`,
        max_players: 2,
        description: `Приглашение в команду для ${player.nick}`,
      })
    } catch {
      setInviteErr(t("contact_sheet.invite_error"))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <button
        type="button"
        aria-label={t("common.close")}
        onClick={onClose}
        className="absolute inset-0 bg-background/70 backdrop-blur-sm animate-rise"
      />

      {/* Sheet */}
      <div className="relative mx-auto w-full max-w-md rounded-t-3xl border-t border-border bg-card p-5 pb-8 animate-rise">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted-foreground/40" />

        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 grid size-8 place-items-center rounded-lg text-muted-foreground active:bg-secondary"
          aria-label={t("common.close")}
        >
          <X className="size-4" />
        </button>

        <div className="flex items-center gap-3">
          <img
            src={player.avatar || "/placeholder.svg"}
            alt={player.nick}
            className="size-14 rounded-2xl object-cover ring-1 ring-border"
          />
          <div>
            <p className="font-display text-xl font-bold leading-tight">{player.nick}</p>
            <p className="text-sm text-muted-foreground">
              {player.realName} · {player.role}
            </p>
          </div>
        </div>

        <p className="mt-4 rounded-2xl bg-secondary/60 p-3 text-sm leading-relaxed text-muted-foreground">
          {player.bio}
        </p>

        {/* Telegram social link */}
        <a
          href={`https://t.me/${player.tgUsername}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center justify-between rounded-2xl border border-accent/30 bg-accent/10 p-3 transition-transform active:scale-[0.98]"
        >
          <span className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-accent text-accent-foreground">
              <Send className="size-4" />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold text-foreground">{t("contact_sheet.write_telegram")}</span>
              <span className="block text-xs text-accent">@{player.tgUsername}</span>
            </span>
          </span>
          <span className="text-xs font-medium text-muted-foreground">{t("contact_sheet.open")}</span>
        </a>

        {/* In-app message */}
        <div className="mt-3">
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <MessageCircle className="size-3.5" /> {t("contact_sheet.quick_message")}
          </label>
          <div className="flex gap-2">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                  if (message.trim()) doSend()
                }
              }}
              placeholder={t("contact_sheet.input_placeholder")}
              className="min-w-0 flex-1 rounded-xl border border-input bg-secondary/60 px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/60"
            />
            <button
              type="button"
              onClick={() => message.trim() && doSend()}
              className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition-transform active:scale-90"
              aria-label={t("common.send")}
            >
              {sent ? <Check className="size-5" /> : <Send className="size-5" />}
            </button>
          </div>
          {sent && (
            <p className="mt-2 text-xs text-accent animate-rise">{t("contact_sheet.chat_opened")}</p>
          )}
        </div>

        {/* Invite to team */}
        <button
          type="button"
          onClick={doInvite}
          className={cn(
            "mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition-all active:scale-[0.98]",
            invited
              ? "bg-accent/15 text-accent"
              : "bg-primary text-primary-foreground shadow-[0_0_20px_-4px_var(--primary)]",
          )}
        >
          {invited ? (
            <>
              <Check className="size-4" /> {inviteErr || t("contact_sheet.invite_sent")}
            </>
          ) : (
            <>
              <UserPlus className="size-4" /> {t("contact_sheet.invite_team")}
            </>
          )}
        </button>
      </div>
    </div>
  )
}
