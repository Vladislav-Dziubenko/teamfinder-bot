"use client"

import { useState, useEffect } from "react"
import { X, Send, MessageCircle, UserPlus, UserCheck, Check, Loader2, Clock } from "lucide-react"
import type { Player } from "@/lib/data"
import { roleL10nKey } from "@/lib/data"
import { useI18n } from "@/lib/i18n"
import { useNexus } from "@/lib/store"
import { cn } from "@/lib/utils"
import { api } from "@/lib/api"

export function ContactSheet({
  player,
  onClose,
}: {
  player: Player | null
  onClose: () => void
}) {
  const { t, tl } = useI18n()
  const { referralBotUrl } = useNexus()
  const botLink = referralBotUrl.replace(/\/+$/, "")
  const [invited, setInvited] = useState(false)
  const [message, setMessage] = useState("")
  const [sent, setSent] = useState(false)
  const [friendLoading, setFriendLoading] = useState(false)
  const [friendSent, setFriendSent] = useState(false)
  const [friendStatus, setFriendStatus] = useState<string | null>(null)

  useEffect(() => {
    if (!player?.id) return
    api.get("/api/profile/by-id/" + player.id).then((d: any) => {
      setFriendStatus(d.friend_status ?? null)
    }).catch(() => {})
  }, [player?.id])

  async function addFriend() {
    setFriendLoading(true)
    try {
      const res = await api.post("/api/friends/add/" + player!.id)
      if (res.error === "cannot add yourself") return
      if (res.already_sent || res.ok) {
        setFriendSent(true)
        setFriendStatus("outgoing")
      }
    } catch {}
    setFriendLoading(false)
  }

  if (!player) return null

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
              {player.realName} · {tl(roleL10nKey(player.game, player.role), player.role)}
            </p>
          </div>
        </div>

        <p className="mt-4 rounded-2xl bg-secondary/60 p-3 text-sm leading-relaxed text-muted-foreground">
          {player.bio}
        </p>

        {/* Telegram social link */}
        <a
          href={player.tgUsername ? `https://t.me/${player.tgUsername}` : (botLink ? `${botLink}?start=profile_${player.id}` : undefined)}
          target="_blank"
          rel="noopener noreferrer"
          className={botLink || player.tgUsername ? "mt-4 flex items-center justify-between rounded-2xl border border-accent/30 bg-accent/10 p-3 transition-transform active:scale-[0.98]" : "pointer-events-none mt-4 flex items-center justify-between rounded-2xl border border-border bg-secondary/40 p-3 opacity-60"}
        >
          <span className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-accent text-accent-foreground">
              <Send className="size-4" />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold text-foreground">{t("contact_sheet.write_telegram")}</span>
              <span className="block text-xs text-accent">
                {player.tgUsername ? `@${player.tgUsername}` : t("contact_sheet.no_username_hint")}
              </span>
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
                  if (message.trim()) setSent(true)
                }
              }}
              placeholder={t("contact_sheet.input_placeholder")}
              className="min-w-0 flex-1 rounded-xl border border-input bg-secondary/60 px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/60"
            />
            <button
              type="button"
              onClick={() => message.trim() && setSent(true)}
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

        {/* Add friend */}
        <button
          type="button"
          onClick={addFriend}
          disabled={!!friendStatus || friendLoading}
          className={cn(
            "mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition-all active:scale-[0.98]",
            friendSent
              ? "bg-accent/15 text-accent"
              : "bg-primary text-primary-foreground shadow-[0_0_20px_-4px_var(--primary)]",
          )}
        >
          {friendLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : friendSent || friendStatus === "outgoing" ? (
            <>
              <Clock className="size-4" /> {t("contact_sheet.invite_sent")}
            </>
          ) : friendStatus === "accepted" ? (
            <>
              <UserCheck className="size-4" /> {t("profile_view.friend_accepted")}
            </>
          ) : (
            <>
              <UserPlus className="size-4" /> {t("contact_sheet.add_friend")}
            </>
          )}
        </button>

        {/* Invite to team — only if not already friends */}
        {friendStatus !== "accepted" && (
          <button
            type="button"
            onClick={() => setInvited(true)}
            className={cn(
              "mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition-all active:scale-[0.98]",
              invited
                ? "bg-accent/15 text-accent"
                : "bg-primary text-primary-foreground shadow-[0_0_20px_-4px_var(--primary)]",
            )}
          >
            {invited ? (
              <>
                <Check className="size-4" /> {t("contact_sheet.invite_sent")}
              </>
            ) : (
              <>
                <UserPlus className="size-4" /> {t("contact_sheet.invite_team")}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
