"use client"

import React, { useEffect, useMemo, useRef, useState, memo } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft, Send, Smile, Sticker, MessagesSquare, CheckCheck, Check, Languages, Loader2, MoreVertical, Trash2, Ban, Unlock, BellOff, BellRing, Shield, ShieldCheck, Crown, Search, UserRound, X, Star, Clock, Mic, MicOff } from "lucide-react"
import {
  useChatMessages,
  useChats,
  useGlobalChat,
  preloadGlobalChat,
  parseIsoTs,
  type ChatPreview,
  type GlobalMessage,
} from "@/lib/chat"
import { useI18n, LANGUAGES } from "@/lib/i18n"
import { api } from "@/lib/api"
import { hapticImpact, hapticTap } from "@/lib/webapp"
import { analytics } from "@/lib/telegram-analytics"
import { cn } from "@/lib/utils"
import { RoleBadge, roleRank } from "@/components/miniapp/role-badge"
import { VoiceRecordButton } from "@/components/miniapp/VoiceRecordButton"
import { VoiceMessagePlayer } from "@/components/miniapp/VoiceMessagePlayer"
import { StarSendSheet } from "@/components/miniapp/star-send-sheet"
import { useMe } from "@/lib/store"

import type { Player } from "@/lib/data"

export function ChatTab({
  openChatId,
  openPlayer,
  onOpenConsumed,
}: {
  openChatId: string | null
  openPlayer?: Player
  onOpenConsumed?: () => void
}) {
  const { t, lang } = useI18n()
  const [activeId, setActiveId] = useState<string | null>(openChatId ?? null)
  const [showGlobal, setShowGlobal] = useState(false)
  const playerRef = useRef<Player | undefined>(openPlayer)
  const onConsumedRef = useRef(onOpenConsumed)
  const chats = useChats()

  // Предзагрузка глобального чата — чтобы он открывался мгновенно
  useEffect(() => {
    preloadGlobalChat()
  }, [])

  // Keep the latest callbacks so the effect doesn't depend on unstable inline fns
  onConsumedRef.current = onOpenConsumed
  if (openPlayer) playerRef.current = openPlayer

  useEffect(() => {
    if (openChatId) {
      setActiveId(openChatId)
      setShowGlobal(false)
      onConsumedRef.current?.()
    }
  }, [openChatId])

  function closeChat() {
    setActiveId(null)
    playerRef.current = undefined
  }

  if (activeId) {
    const found = chats.find((c) => c.id === activeId)
    // Prefer the server-provided chat data (authoritative nick/avatar); only
    // fall back to the openPlayer passed by the parent when the chat isn't in
    // the loaded list yet (e.g. just opened). This avoids showing stale data.
    const player = found?.player ?? playerRef.current ?? undefined
    return <ChatConversation chatId={activeId} player={player} role={found?.role} onBack={closeChat} />
  }

  if (showGlobal) {
    return <GlobalChat onBack={() => setShowGlobal(false)} />
  }

  return (
    <div className="space-y-4 px-4 py-5">
      <div>
        <h1 className="font-display text-2xl font-bold">{t("chat.title")}</h1>
        <p className="text-sm text-muted-foreground text-pretty">{t("chat.subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-2xl border border-border bg-card p-1">
        <button
          type="button"
          onClick={() => setShowGlobal(false)}
          className={cn(
            "rounded-xl px-3 py-2 text-sm font-bold transition-colors",
            !showGlobal ? "bg-primary text-primary-foreground" : "text-muted-foreground",
          )}
        >
          {t("chat.dm_tab")}
        </button>
        <button
          type="button"
          onClick={() => setShowGlobal(true)}
          className={cn(
            "rounded-xl px-3 py-2 text-sm font-bold transition-colors",
            showGlobal ? "bg-primary text-primary-foreground" : "text-muted-foreground",
          )}
        >
          {t("chat.global_tab")}
        </button>
      </div>

      {chats.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border py-12 text-center">
          <MessagesSquare className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-2 font-display text-lg font-bold">{t("chat.empty_title")}</p>
          <p className="text-sm text-muted-foreground">{t("chat.empty_hint")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {chats.map((c) => (
            <ChatRow key={c.id} chat={c} onClick={() => setActiveId(c.id)} lang={lang} />
          ))}
        </div>
      )}
    </div>
  )
}

function ChatRow({ chat, onClick, lang }: { chat: ChatPreview; onClick: () => void; lang: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left transition-transform active:scale-[0.99]"
    >
      <div className="relative shrink-0">
        <img
          src={chat.player.avatar || "/placeholder.svg"}
          alt={chat.player.nick}
          className="size-12 rounded-2xl object-cover"
        />
        {chat.player.online && (
          <span className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-card bg-accent" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate font-display text-sm font-bold">{chat.player.nick}</p>
            <RoleBadge role={chat.role} className="shrink-0" />
          </div>
          <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(chat.lastTs, lang)}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="truncate text-sm text-muted-foreground">{chat.lastText}</p>
          {chat.unread > 0 && (
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
              {chat.unread}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

type Message = {
  id: string
  senderId: string
  text: string
  ts: number
  status?: "sent" | "read"
  isVoice?: boolean
  voiceDuration?: number
  voiceMime?: string
}

const MessageBubble = React.memo(function MessageBubble({ message: m, mine, chatId }: { message: Message; mine: boolean; chatId: string }) {
  const { t, lang } = useI18n()
  const [translated, setTranslated] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isSticker = isStickerText(m.text)
  const isVoice = Boolean(m.isVoice)

  if (isVoice) {
    return (
      <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
        <VoiceMessagePlayer
          src={`/api/chat/${chatId}/voice/${m.id}`}
          duration={m.voiceDuration || 0}
          mime={m.voiceMime}
        />
        <div className={cn("flex items-center gap-1 mt-0.5", mine ? "justify-end" : "justify-start")}>
          <span className={cn("text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
            {formatMsgTime(m.ts, lang)}
          </span>
        </div>
      </div>
    )
  }

  if (isSticker) {
    return (
      <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
        <div className="flex max-w-[78%] flex-col items-end gap-1">
          <p className="text-[64px] leading-none drop-shadow-md">{m.text}</p>
          <span className={cn("flex items-center gap-1 text-[10px]", mine ? "text-muted-foreground/70" : "text-muted-foreground")}>
            {formatMsgTime(m.ts, lang)}
            {mine && (m.status === "read" ? <CheckCheck className="size-3" /> : <Check className="size-3" />)}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3 py-2 text-sm",
          mine
            ? "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md border border-border bg-card text-card-foreground",
        )}
      >
        <p className="text-pretty leading-relaxed">{translated || m.text}</p>
        {translated && translated !== m.text && (
          <p className="mt-1 border-t border-border/40 pt-1 text-[11px] italic text-muted-foreground">
            {m.text}
          </p>
        )}
        <div className="mt-1 flex items-center justify-between gap-2">
          <span
            className={cn(
              "flex items-center gap-1 text-[10px]",
              mine ? "text-primary-foreground/70" : "text-muted-foreground",
            )}
          >
            {formatMsgTime(m.ts, lang)}
            {mine &&
              (m.status === "read" ? <CheckCheck className="size-3" /> : <Check className="size-3" />)}
          </span>
          {!mine && (
            <button
              type="button"
              onClick={doTranslate}
              disabled={loading}
              className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground/60 hover:text-foreground active:scale-90 disabled:opacity-40"
              aria-label={t("chat.translate")}
            >
              {loading ? <Loader2 className="size-3 animate-spin" /> : <Languages className="size-3" />}
            </button>
          )}
        </div>
      </div>
    </div>
  )
})

function ChatConversation({ chatId, player, role, onBack }: { chatId: string; player?: ChatPreview["player"]; role?: string; onBack: () => void }) {
  const { t, lang } = useI18n()
  const { messages, status, sendMessage, appendServerMessage, typing, clearChat, blockUser, unblockUser, muteChat, unmuteChat, loadEarlier, loadingEarlier, hasMore } = useChatMessages(chatId)
  const [draft, setDraft] = useState("")
  const [showEmoji, setShowEmoji] = useState(false)
  const [showStickers, setShowStickers] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [starSheetOpen, setStarSheetOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages.length, typing])

  const blocked = status?.blocked ?? false
  const muted = status?.muted ?? false
  const blockedByOther = status?.blockedByOther ?? false

  const emojis = useMemo(
    () => ["😀","😂","🥰","😎","🤔","😢","😡","🔥","⭐","💯","❤️","👍","🎉","✨","💪","🙏","😢","🤗","🤩","💀"],
    [],
  )

  function insertEmoji(emoji: string) {
    setDraft((d) => d + emoji)
    inputRef.current?.focus()
  }

  function openStickerPanel() {
    setShowStickers((v) => !v)
    setShowEmoji(false)
  }

  function sendSticker(sticker: string) {
    sendMessage(sticker)
  }

  function toggleEmoji() {
    setShowEmoji((v) => !v)
    setShowStickers(false)
  }

  function submit() {
    if (!draft.trim()) return
    hapticImpact()
    analytics.chatSend()
    sendMessage(draft)
    setDraft("")
  }

  function handleVoiceSent(serverMsg: any) {
    appendServerMessage(serverMsg)
  }

  function actionClear() {
    setMenuOpen(false)
    clearChat()
  }

  function actionBlock() {
    setMenuOpen(false)
    if (blocked) unblockUser()
    else blockUser()
  }

  function actionMute() {
    setMenuOpen(false)
    if (muted) unmuteChat()
    else muteChat()
  }

  const canSend = !blockedByOther

  return (
    <div className="fixed inset-x-0 top-0 bottom-[60px] z-50 mx-auto flex max-w-md flex-col bg-background pb-[env(safe-area-inset-bottom)]">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border bg-card/85 px-3 py-3 backdrop-blur-xl">
        <button type="button" onClick={onBack} aria-label={t("chat.back")} className="grid size-9 place-items-center rounded-full text-muted-foreground active:scale-90">
          <ChevronLeft className="size-5" />
        </button>
        <img src={player?.avatar || "/placeholder.svg"} alt={player?.nick ?? t("common.unknown")} className="size-9 rounded-full object-cover" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate font-display text-sm font-bold">{player?.nick ?? t("common.unknown")}</p>
            <RoleBadge role={role} className="shrink-0" />
          </div>
          <p className="text-[11px] text-accent">
            {blockedByOther
              ? t("chat.blocked_hint")
              : typing
                ? t("common.typing")
                : player?.online
                  ? t("common.online")
                  : player?.lastSeen
                    ? formatLastSeen(player.lastSeen, lang)
                    : t("common.offline")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setStarSheetOpen(true)}
          aria-label={t("chat.send_stars")}
          className="grid size-9 place-items-center rounded-full text-stars active:scale-90"
        >
          <Star className="size-5 fill-stars" />
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={t("chat.menu")}
            className="grid size-9 place-items-center rounded-full text-muted-foreground active:scale-90"
          >
            <MoreVertical className="size-5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
              <button type="button" onClick={actionMute} className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm hover:bg-muted active:bg-muted">
                {muted ? <BellRing className="size-4 text-muted-foreground" /> : <BellOff className="size-4 text-muted-foreground" />}
                {muted ? t("chat.unmute") : t("chat.mute")}
              </button>
              <button type="button" onClick={actionBlock} className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm hover:bg-muted active:bg-muted">
                {blocked ? <Unlock className="size-4 text-muted-foreground" /> : <Ban className="size-4 text-muted-foreground" />}
                {blocked ? t("chat.unblock") : t("chat.block")}
              </button>
              <button type="button" onClick={actionClear} className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-destructive hover:bg-muted active:bg-muted">
                <Trash2 className="size-4" />
                {t("chat.clear")}
              </button>
            </div>
          )}
        </div>
      </header>

      {blockedByOther && (
        <div className="border-b border-border bg-muted/50 px-4 py-2 text-center text-xs text-muted-foreground">
          {t("chat.blocked_by_other")}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {hasMore && (
          <button
            type="button"
            onClick={loadEarlier}
            disabled={loadingEarlier}
            className="mx-auto mt-2 mb-1 rounded-xl border border-border bg-card/85 px-3 py-1.5 text-sm text-muted-foreground transition-colors active:scale-95 disabled:opacity-50"
          >
            {loadingEarlier ? (
              <>
                <Loader2 className="inline size-3 animate-spin mr-1" />
                {t("chat.loading_earlier")}
              </>
            ) : (
              t("chat.load_earlier")
            )}
          </button>
        )}
        {messages.map((m) => {
          const mine = m.senderId === "me"
          return <MessageBubble key={m.id} message={m} mine={mine} chatId={chatId} />
        })}
        {typing && !blockedByOther && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-border bg-card px-3 py-3">
              <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
            </div>
          </div>
        )}
      </div>

      {/* Emoji strip */}
      {showEmoji && canSend && (
        <div className="flex flex-wrap gap-1.5 border-t border-border bg-card/85 px-3 py-2 backdrop-blur-xl">
          {emojis.map((e) => (
            <button key={e} type="button" onClick={() => insertEmoji(e)} className="grid size-9 place-items-center rounded-lg text-lg active:scale-90">
              {e}
            </button>
          ))}
        </div>
      )}

      {/* Sticker panel */}
      {showStickers && canSend && (
        <StickerPanel onPick={sendSticker} onClose={() => setShowStickers(false)} />
      )}

      <div className="flex items-center gap-2 border-t border-border bg-card/85 px-3 py-2.5 backdrop-blur-xl">
        {canSend ? (
          <>
            <button type="button" onClick={toggleEmoji} aria-label={t("chat.emoji")} className="grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground active:scale-90">
              <Smile className="size-5" />
            </button>
            <button type="button" onClick={openStickerPanel} aria-label={t("chat.sticker")} className="grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground active:scale-90">
              <Sticker className="size-5" />
            </button>
            <VoiceRecordButton chatId={chatId} onSend={handleVoiceSent} disabled={!canSend} />
            <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); submit() } }} placeholder={t("chat.input_placeholder")} className="min-w-0 flex-1 rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/50" />
            <button type="button" onClick={submit} disabled={!draft.trim()} aria-label={t("common.send")} className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground transition-transform active:scale-90 disabled:opacity-40">
              <Send className="size-5" />
            </button>
          </>
        ) : (
          <div className="flex-1 py-3 text-center text-sm text-muted-foreground">{t("chat.blocked_hint")}</div>
        )}
      </div>
      <StarSendSheet
        open={starSheetOpen}
        onClose={() => setStarSheetOpen(false)}
        fixed={player && player.id ? { id: Number(player.id), nick: player.nick, avatar: player.avatar } : undefined}
      />
    </div>
  )
}

function GlobalChat({ onBack }: { onBack: () => void }) {
  const { t, lang } = useI18n()
  const me = useMe()
  const { messages, loaded, meRole, meBanned, sendGlobal, sending, deleteMessage, banUser, unbanUser } = useGlobalChat()
  const [draft, setDraft] = useState("")
  const [showEmoji, setShowEmoji] = useState(false)
  const [showStickers, setShowStickers] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [gErr, setGErr] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)

  useEffect(() => {
    if (!gErr) return
    const tm = setTimeout(() => setGErr(null), 4000)
    return () => clearTimeout(tm)
  }, [gErr])

  const myRank = roleRank(meRole)
  const canModerate = myRank >= 1
  const canBan = myRank >= 2
  const isDev = myRank >= 3

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages.length])

  const emojis = useMemo(
    () => ["😀","😂","🥰","😎","🤔","😢","😡","🔥","⭐","💯","❤️","👍","🎉","✨","💪","🙏","😢","🤗","🤩","💀"],
    [],
  )

  function insertEmoji(emoji: string) {
    setDraft((d) => d + emoji)
  }

  function toggleEmoji() {
    setShowEmoji((v) => !v)
    setShowStickers(false)
  }

  function openStickerPanel() {
    setShowStickers((v) => !v)
    setShowEmoji(false)
  }

  async function sendSticker(sticker: string) {
    const ok = await sendGlobal(sticker)
    if (ok) setShowStickers(false)
  }

  async function submit() {
    if (!draft.trim() || meBanned) return
    const ok = await sendGlobal(draft)
    if (ok) setDraft("")
  }

  async function onDelete(m: GlobalMessage) {
    setMenuFor(null)
    await deleteMessage(m.id)
  }

  async function onBan(m: GlobalMessage) {
    setMenuFor(null)
    const r = await banUser(m.userId)
    if (!r.ok) setGErr(r.error)
  }

  return (
    <div className="fixed inset-x-0 top-0 bottom-[60px] z-50 mx-auto flex max-w-md flex-col bg-background pb-[env(safe-area-inset-bottom)]">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border bg-card/85 px-3 py-3 backdrop-blur-xl">
        <button type="button" onClick={onBack} aria-label={t("chat.back")} className="grid size-9 place-items-center rounded-full text-muted-foreground active:scale-90">
          <ChevronLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-bold">{t("chat.global_title")}</p>
          <p className="text-[11px] text-muted-foreground">{t("chat.global_subtitle")}</p>
        </div>
        {isDev && (
          <button
            type="button"
            onClick={() => setAdminOpen((v) => !v)}
            aria-label={t("role.admin_panel")}
            className={cn(
              "grid size-9 place-items-center rounded-full text-muted-foreground active:scale-90",
              adminOpen && "bg-primary text-primary-foreground",
            )}
          >
            <Shield className="size-5" />
          </button>
        )}
      </header>

      {meBanned && (
        <div className="border-b border-border bg-destructive/15 px-4 py-2 text-center text-xs font-semibold text-destructive">
          {t("chat.global_banned")}
        </div>
      )}

      {adminOpen && isDev && <AdminPanel userId={me.userId} />}

      {gErr && (
        <div className="border-b border-destructive/40 bg-destructive/15 px-4 py-2 text-center text-xs font-semibold text-destructive">
          {gErr}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {!loaded && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t("chat.global_loading")}</p>
          </div>
        )}
        {loaded && messages.length === 0 && (
          <div className="rounded-3xl border border-dashed border-border py-12 text-center">
            <MessagesSquare className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-2 font-display text-lg font-bold">{t("chat.empty_title")}</p>
            <p className="text-sm text-muted-foreground">{t("chat.empty_hint")}</p>
          </div>
        )}
        {messages.map((m) => (
          <GlobalMsg
            key={m.id}
            msg={m}
            mine={m.userId === "me"}
            lang={lang}
            canModerate={m.userId !== "me" && canModerate}
            canBanThis={m.userId !== "me" && canBan && roleRank(m.role) < myRank}
            menuFor={menuFor === m.id}
            onToggleMenu={() => setMenuFor(menuFor === m.id ? null : m.id)}
            onDelete={() => onDelete(m)}
            onBan={() => onBan(m)}
          />
        ))}
      </div>

      {/* Emoji strip */}
      {showEmoji && !meBanned && (
        <div className="flex flex-wrap gap-1.5 border-t border-border bg-card/85 px-3 py-2 backdrop-blur-xl">
          {emojis.map((e) => (
            <button key={e} type="button" onClick={() => insertEmoji(e)} className="grid size-9 place-items-center rounded-lg text-lg active:scale-90">
              {e}
            </button>
          ))}
        </div>
      )}

      {/* Sticker panel */}
      {showStickers && !meBanned && (
        <StickerPanel onPick={sendSticker} onClose={() => setShowStickers(false)} />
      )}

      {/* Input */}
      <div className="flex items-center gap-2 border-t border-border bg-card/85 px-3 py-2.5 backdrop-blur-xl">
        {meBanned ? (
          <div className="flex-1 py-3 text-center text-sm text-muted-foreground">{t("chat.global_banned")}</div>
        ) : (
          <>
            <button type="button" onClick={toggleEmoji} aria-label={t("chat.emoji")} className="grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground active:scale-90">
              <Smile className="size-5" />
            </button>
            <button type="button" onClick={openStickerPanel} aria-label={t("chat.sticker")} className="grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground active:scale-90">
              <Sticker className="size-5" />
            </button>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); submit() } }}
              placeholder={t("chat.input_placeholder")}
              className="min-w-0 flex-1 rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
            />
            <button type="button" onClick={submit} disabled={!draft.trim() || sending} aria-label={t("common.send")} className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground transition-transform active:scale-90 disabled:opacity-40">
              {sending ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function Dot({ delay = "0ms" }: { delay?: string }) {
  return (
    <span
      className="size-1.5 animate-bounce rounded-full bg-muted-foreground"
      style={{ animationDelay: delay }}
    />
  )
}

type AdminUser = {
  id: number
  nick: string
  avatar: string | null
  username: string
  firstName: string
  lastName: string
  role: string
  isBeta: boolean
  banned: boolean
}

function AdminPanel({ userId }: { userId: number }) {
  const { t } = useI18n()
  const [query, setQuery] = useState("")
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [tgBusy, setTgBusy] = useState<number | null>(null)
  const [tgMsg, setTgMsg] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ u: AdminUser; action: "role" | "ban"; role?: string } | null>(null)
  const [banModal, setBanModal] = useState<{ u: AdminUser } | null>(null)
  const [banReason, setBanReason] = useState("")
  const [banDuration, setBanDuration] = useState(0)
  const [banBusy, setBanBusy] = useState(false)
  const [panelMsg, setPanelMsg] = useState<{ text: string; err: boolean } | null>(null)

  useEffect(() => {
    if (!panelMsg) return
    if (banModal) return
    const tm = setTimeout(() => setPanelMsg(null), 6000)
    return () => clearTimeout(tm)
  }, [panelMsg, banModal])

  function showError(e: any, fallback: string) {
    const text = (e?.message || fallback).slice(0, 200)
    console.error("[admin] action failed:", e)
    setPanelMsg({ text, err: true })
  }

  useEffect(() => {
    if (!tgMsg) return
    const tm = setTimeout(() => setTgMsg(null), 3000)
    return () => clearTimeout(tm)
  }, [tgMsg])

  async function requestTgProfile(u: AdminUser) {
    if (tgBusy !== null) return
    setTgBusy(u.id)
    setTgMsg(null)
    try {
      const res: any = await api.post(`/api/admin/tg-profile/${u.id}`)
      if (res.ok) {
        setTgMsg(res.forwarded ? t("role.tg_profile_ok_forwarded") : t("role.tg_profile_ok"))
      } else {
        setTgMsg(t("role.tg_profile_fail"))
      }
    } catch {
      setTgMsg(t("role.tg_profile_fail"))
    }
    setTgBusy(null)
  }

  async function search(q: string) {
    setQuery(q)
    setLoading(true)
    try {
      const data: any = await api.get("/api/admin/users?q=" + encodeURIComponent(q))
      const list: AdminUser[] = (data.users ?? []).map((u: any) => ({
        id: u.user_id ?? u.id,
        nick: u.nick ?? "",
        avatar: u.avatar ?? null,
        username: u.username ?? "",
        firstName: u.first_name ?? "",
        lastName: u.last_name ?? "",
        role: u.role ?? "",
        isBeta: Boolean(u.is_beta),
        banned: Boolean(u.banned),
      }))
      setUsers(list.filter((u) => u.id !== userId))
    } catch {
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    search("")
  }, [])

  async function applyRole(u: AdminUser, role: string) {
    if (busyId) return
    setBusyId(u.id)
    try {
      await api.post("/api/admin/role", { user_id: u.id, role })
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role } : x)))
    } catch (e: any) {
      showError(e, "Role change failed")
    }
    setBusyId(null)
  }

  async function toggleBeta(u: AdminUser) {
    if (busyId) return
    setBusyId(u.id)
    try {
      await api.post("/api/admin/role", { user_id: u.id, beta: !u.isBeta })
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, isBeta: !u.isBeta } : x)))
    } catch (e: any) {
      showError(e, "Beta toggle failed")
    }
    setBusyId(null)
  }

  async function toggleBan(u: AdminUser) {
    if (busyId) return
    setBusyId(u.id)
    try {
      await api.post("/api/global/unban", { user_id: u.id })
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, banned: false } : x)))
    } catch (e: any) {
      showError(e, "Unban failed")
    }
    setBusyId(null)
  }

  async function sendBan(u: AdminUser, reason: string, duration: number) {
    if (banBusy) return
    setBanBusy(true)
    setPanelMsg(null)
    try {
      await api.post("/api/global/ban", { user_id: u.id, reason: reason.trim(), duration })
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, banned: true } : x)))
      setBanModal(null)
      setBanReason("")
      setBanDuration(0)
      setPanelMsg({ text: t("role.banned_ok"), err: false })
    } catch (e: any) {
      console.error("[admin] ban failed:", e)
      setPanelMsg({ text: (e?.message || t("role.ban_failed")).slice(0, 200), err: true })
    }
    setBanBusy(false)
  }

  function confirmAction() {
    if (!confirm) return
    const { u, action, role } = confirm
    setConfirm(null)
    if (action === "role") applyRole(u, role ?? "")
    else toggleBan(u)
  }

  return (
    <div className="max-h-[45vh] overflow-y-auto border-b border-border bg-card/85 px-3 py-3 backdrop-blur-xl">
      <div className="mb-2 flex items-center gap-2">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder={t("role.search_placeholder")}
          className="min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
        />
      </div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("role.title")}</p>
      {panelMsg && (
        <p className={cn(
          "mb-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold",
          panelMsg.err ? "border-destructive/40 bg-destructive/15 text-destructive" : "border-emerald-500/40 bg-emerald-500/15 text-emerald-500",
        )}>
          {panelMsg.text}
        </p>
      )}
      {loading && <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />}
      <div className="space-y-1.5">
        {users.map((u) => (
          <div key={u.id} className="rounded-xl border border-border bg-background px-3 py-2">
            <div className="flex items-center gap-2">
              <img src={u.avatar || "/placeholder.svg"} alt={u.nick} className="size-8 shrink-0 rounded-full object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {u.nick || [u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}
                </p>
                <div className="flex items-center gap-1.5">
                  <RoleBadge role={u.role} />
                  {u.isBeta && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/50 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold leading-none text-emerald-400">
                      ∞
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  ID {u.id}
                  {(u.username || u.firstName) && (
                    <span className="text-foreground/80"> · {[u.firstName, u.lastName].filter(Boolean).join(" ")}{u.username ? ` · @${u.username}` : ""}</span>
                  )}
                  {u.banned && <span className="text-destructive"> · {t("role.banned")}</span>}
                </p>
                <button
                  type="button"
                  disabled={tgBusy !== null}
                  onClick={() => requestTgProfile(u)}
                  className="mt-1.5 inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary transition-colors active:scale-95 disabled:opacity-50"
                >
                  {tgBusy === u.id ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
                  {t("role.tg_profile")}
                </button>
                {tgMsg && <p className="mt-1 text-[10px] font-medium text-accent">{tgMsg}</p>}
              </div>
              {busyId === u.id && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={() => setConfirm({ u, action: "role", role: u.role === "moderator" ? "" : "moderator" })}
                className={cn(
                  "rounded-lg border px-2 py-1.5 text-[11px] font-bold transition-colors",
                  u.role === "moderator"
                    ? "border-sky-500/50 bg-sky-500/15 text-sky-400"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {u.role === "moderator" ? t("role.remove") : t("role.moderator")}
              </button>
              <button
                type="button"
                onClick={() => setConfirm({ u, action: "role", role: u.role === "admin" ? "" : "admin" })}
                className={cn(
                  "rounded-lg border px-2 py-1.5 text-[11px] font-bold transition-colors",
                  u.role === "admin"
                    ? "border-red-500/50 bg-red-500/15 text-red-400"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {u.role === "admin" ? t("role.remove") : t("role.admin")}
              </button>
              <button
                type="button"
                onClick={() => toggleBeta(u)}
                className={cn(
                  "rounded-lg border px-2 py-1.5 text-[11px] font-bold transition-colors",
                  u.isBeta
                    ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {u.isBeta ? t("role.remove") : "β " + t("role.beta_tester")}
              </button>
              <button
                type="button"
                onClick={() => (u.banned ? setConfirm({ u, action: "ban" }) : setBanModal({ u }))}
                className={cn(
                  "rounded-lg border px-2 py-1.5 text-[11px] font-bold transition-colors",
                  u.banned
                    ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-500"
                    : "border-destructive/40 text-destructive hover:bg-destructive/10",
                )}
              >
                {u.banned ? t("role.unban") : t("role.ban")}
              </button>
            </div>
          </div>
        ))}
        {!loading && users.length === 0 && (
          <p className="py-3 text-center text-xs text-muted-foreground">{t("role.empty")}</p>
        )}
      </div>
      {confirm &&
        createPortal(
          <ConfirmDialog confirm={confirm} onConfirm={confirmAction} onCancel={() => setConfirm(null)} />,
          document.body,
        )}
      {banModal &&
        createPortal(
          <BanModal
            user={banModal.u}
            reason={banReason}
            duration={banDuration}
            busy={banBusy}
            error={panelMsg?.err ? panelMsg.text : ""}
            onReason={setBanReason}
            onDuration={setBanDuration}
            onCancel={() => setBanModal(null)}
            onConfirm={() => sendBan(banModal.u, banReason, banDuration)}
          />,
          document.body,
        )}
    </div>
  )
}

function ConfirmDialog({
  confirm,
  onConfirm,
  onCancel,
}: {
  confirm: { u: AdminUser; action: "role" | "ban"; role?: string }
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useI18n()
  const isRemove = confirm.action === "role" && !confirm.role
  const isBan = confirm.action === "ban" && !confirm.u.banned
  const title = isBan
    ? t("role.confirm_ban_title")
    : confirm.action === "ban"
      ? t("role.confirm_unban_title")
      : isRemove
        ? t("role.confirm_remove_title")
        : t("role.confirm_grant_title")
  const body = isBan
    ? t("role.confirm_ban_body", { name: confirm.u.nick })
    : confirm.action === "ban"
      ? t("role.confirm_unban_body", { name: confirm.u.nick })
      : isRemove
        ? t("role.confirm_remove_body", { name: confirm.u.nick })
        : t("role.confirm_grant_body", { name: confirm.u.nick, role: confirm.role === "admin" ? t("role.admin") : t("role.moderator") })
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/70 p-6 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-5 shadow-2xl">
        <p className="font-display text-lg font-bold">{title}</p>
        <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
        <p className="mt-1 text-[11px] font-semibold text-muted-foreground">ID {confirm.u.id}</p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-2xl border border-border bg-secondary/60 py-3 text-sm font-semibold active:scale-[0.98]"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground active:scale-[0.98]"
          >
            {t("role.confirm")}
          </button>
        </div>
      </div>
    </div>
  )
}

const BAN_DURATIONS = [0, 24 * 3600, 7 * 24 * 3600, 30 * 24 * 3600] as const

function BanModal({
  user,
  reason,
  duration,
  busy,
  error,
  onReason,
  onDuration,
  onCancel,
  onConfirm,
}: {
  user: AdminUser
  reason: string
  duration: number
  busy: boolean
  error?: string
  onReason: (v: string) => void
  onDuration: (v: number) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const { t } = useI18n()
  const ready = !busy

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl sm:rounded-3xl">
        {/* Шапка с градиентом */}
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-b from-destructive/30 via-destructive/10 to-transparent px-5 pb-5 pt-6">
          <div className="pointer-events-none absolute -top-12 right-0 h-36 w-36 rounded-full bg-destructive/25 blur-3xl" />
          <div className="relative flex items-center gap-3">
            <img
              src={user.avatar || "/placeholder.svg"}
              alt={user.nick}
              className="size-12 shrink-0 rounded-2xl border border-destructive/30 object-cover"
            />
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-lg font-bold">{t("role.ban_modal_title")}</h3>
              <p className="truncate text-sm font-semibold text-foreground">
                {user.nick || [user.firstName, user.lastName].filter(Boolean).join(" ") || "—"}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">ID {user.id}</p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="grid size-8 shrink-0 place-items-center rounded-full bg-background/60 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-6 pt-3">
          {/* Причина */}
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {t("role.ban_modal_reason")}
            </label>
            <div className="relative">
              <textarea
                value={reason}
                onChange={(e) => onReason(e.target.value.slice(0, 200))}
                placeholder={t("role.ban_modal_reason_ph")}
                rows={3}
                className="w-full resize-none rounded-2xl border border-input bg-background px-3.5 py-3 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-destructive/50"
              />
              <span className="absolute bottom-2.5 right-3 text-[10px] tabular-nums text-muted-foreground/60">
                {reason.length}/200
              </span>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground/70">{t("role.ban_modal_hint")}</p>
          </div>

          {/* Срок */}
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {t("role.ban_modal_duration")}
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {BAN_DURATIONS.map((d, i) => {
                const labels = [
                  t("role.ban_modal_forever"),
                  t("role.ban_modal_24h"),
                  t("role.ban_modal_7d"),
                  t("role.ban_modal_30d"),
                ]
                const active = duration === d
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => onDuration(d)}
                    className={cn(
                      "flex flex-col items-center gap-0.5 rounded-2xl border px-2 py-2.5 text-[11px] font-bold leading-tight transition-colors",
                      active
                        ? "border-destructive bg-destructive/15 text-destructive"
                        : "border-border text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {i === 0 ? <Shield className="size-3.5" /> : <Clock className="size-3.5" />}
                    {labels[i]}
                  </button>
                )
              })}
            </div>
          </div>

          {error && (
            <p className="rounded-xl border border-destructive/40 bg-destructive/15 px-3 py-2 text-[11px] font-semibold text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-2xl border border-border bg-secondary/60 py-3 text-sm font-semibold active:scale-[0.98]"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              disabled={!ready}
              onClick={onConfirm}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-destructive to-red-700 py-3 text-sm font-bold text-white shadow-[0_10px_30px_-10px_rgba(239,68,68,0.7)] transition-transform active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />}
              {t("role.ban_modal_btn")}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatMsgTime(ts: number, lang: string): string {
  return relativeTime(ts, lang)
}

const EMOJI_ONLY_RE = /^[\p{Extended_Pictographic}\u200d\ufe0f\s]{1,4}$/u

/** Считает сообщение стикером, если это чистая короткая эмодзи-строка. */
function isStickerText(text: string): boolean {
  const t = (text ?? "").trim()
  if (!t || t.length > 8) return false
  return EMOJI_ONLY_RE.test(t)
}

const STICKERS = [
  "🔥", "⚡", "💯", "😎", "😂", "🥳", "🎉", "😭", "😡", "😱",
  "❤️", "💔", "👍", "👎", "🙏", "🤝", "💪", "🫡", "🤯", "🥶",
  "👑", "🏆", "🚀", "💀", "🤝", "👊", "✌️", "🤞", "🎮", "🕹️",
  "🐱", "🐶", "🦊", "🐼", "🍀", "💎", "⭐", "🌚", "🌝", "💤",
]

function StickerPanel({ onPick, onClose }: { onPick: (sticker: string) => void; onClose: () => void }) {
  const { t } = useI18n()
  return (
    <div className="border-t border-border bg-card/85 px-3 py-2 backdrop-blur-xl">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("chat.stickers_title")}</p>
        <button type="button" onClick={onClose} className="grid size-6 place-items-center rounded-lg text-muted-foreground active:bg-secondary" aria-label={t("common.close")}>
          <X className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-8 gap-1">
        {STICKERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="grid aspect-square place-items-center rounded-xl text-2xl transition-transform active:scale-90 hover:bg-muted"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

const GlobalMsg = memo(function GlobalMsg({
  msg,
  mine,
  lang,
  canModerate,
  canBanThis,
  menuFor,
  onToggleMenu,
  onDelete,
  onBan,
}: {
  msg: GlobalMessage
  mine: boolean
  lang: string
  canModerate: boolean
  canBanThis: boolean
  menuFor: boolean
  onToggleMenu: () => void
  onDelete: () => void
  onBan: () => void
}) {
  const { t } = useI18n()
  const [translated, setTranslated] = useState<string | null>(null)
  const [translatedLang, setTranslatedLang] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const sticker = isStickerText(msg.text)

  async function doTranslate(target: string) {
    setPickerOpen(false)
    if (!msg.text.trim() || sticker) return
    setLoading(true)
    try {
      const res = await api.post("/api/translate", { text: msg.text, target })
      setTranslated(res.translated ?? null)
      setTranslatedLang(target)
    } catch {}
    setLoading(false)
  }

  if (msg.kind === "system") {
    return (
      <div className="flex justify-center px-6">
        <div className="w-full max-w-[92%] rounded-2xl border border-[#ffd700]/40 bg-gradient-to-r from-[#ffd700]/15 via-[#ff9d00]/10 to-[#ffd700]/15 px-4 py-3 text-center">
          <p className="flex items-center justify-center gap-1.5 text-sm font-bold text-[#ffd700]">
            <span className="text-lg leading-none">💎</span>
            <span className="truncate">{msg.nick}</span>
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-card-foreground">{msg.text}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">{relativeTime(msg.ts, lang)}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("group flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          sticker ? "max-w-[78%]" : "max-w-[78%] rounded-2xl px-3 py-2 text-sm",
          mine
            ? "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md border border-border bg-card text-card-foreground",
        )}
      >
        {!mine && (
          <div className="mb-1 flex items-center gap-1.5">
            <img src={msg.avatar || "/placeholder.svg"} alt={msg.nick} className="size-4 rounded-full object-cover" />
            <span className="text-[11px] font-bold text-accent">{msg.nick}</span>
            <RoleBadge role={msg.role} />
          </div>
        )}
        {mine && <RoleBadge role={msg.role} className="mb-1 self-end" />}
        {sticker ? (
          <p className="select-none text-6xl leading-none">{msg.text.trim()}</p>
        ) : (
          <p className="text-pretty leading-relaxed">{translated || msg.text}</p>
        )}
        {!sticker && translated && translated !== msg.text && (
          <p className="mt-1 border-t border-border/40 pt-1 text-[11px] italic text-muted-foreground">
            {msg.text}
          </p>
        )}
        {!sticker && (
          <div className="mt-1 flex items-center justify-end gap-2">
            <span className={cn("text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
              {translatedLang ? translatedLang.toUpperCase() + " · " : ""}
              {relativeTime(msg.ts, lang)}
            </span>
            {!mine && (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                disabled={loading}
                aria-label={t("chat.translate")}
                className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground/60 hover:text-foreground active:scale-90 disabled:opacity-40"
              >
                {loading ? <Loader2 className="size-3 animate-spin" /> : <Languages className="size-3" />}
              </button>
            )}
          </div>
        )}
      </div>
      {(canModerate || canBanThis) && (
        <div className="relative ml-1 flex items-start">
          <button
            type="button"
            onClick={onToggleMenu}
            aria-label={t("chat.menu")}
            className="grid size-7 place-items-center rounded-full text-muted-foreground/60 opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100"
          >
            <MoreVertical className="size-4" />
          </button>
          {menuFor && (
            <div className="absolute left-1 top-8 z-50 w-44 overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
              {canModerate && (
                <button type="button" onClick={onDelete} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted">
                  <Trash2 className="size-4 text-muted-foreground" />
                  {t("chat.mod_delete")}
                </button>
              )}
              {canBanThis && (
                <button type="button" onClick={onBan} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-destructive hover:bg-muted">
                  <Ban className="size-4" />
                  {t("chat.mod_ban")}
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {pickerOpen && <TranslateLangPicker onPick={doTranslate} onClose={() => setPickerOpen(false)} />}
    </div>
  )
}, (prev, next) =>
  prev.msg.id === next.msg.id &&
  prev.msg.text === next.msg.text &&
  prev.msg.ts === next.msg.ts &&
  prev.msg.nick === next.msg.nick &&
  prev.msg.avatar === next.msg.avatar &&
  prev.msg.role === next.msg.role &&
  prev.msg.deco === next.msg.deco &&
  prev.msg.kind === next.msg.kind &&
  prev.mine === next.mine &&
  prev.lang === next.lang &&
  prev.canModerate === next.canModerate &&
  prev.canBanThis === next.canBanThis &&
  prev.menuFor === next.menuFor,
)

function TranslateLangPicker({ onPick, onClose }: { onPick: (code: string) => void; onClose: () => void }) {
  const { t } = useI18n()
  const [query, setQuery] = useState("")
  const filtered = LANGUAGES.filter((l) => {
    if (!query) return true
    const q = query.toLowerCase()
    return l.name.toLowerCase().includes(q) || l.nativeName.toLowerCase().includes(q) || l.code.toLowerCase().includes(q)
  })
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <button type="button" aria-label={t("common.close")} onClick={onClose} className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
      <div className="relative mx-auto max-h-[75dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border-t border-border bg-card pb-8">
        <div className="sticky top-0 z-10 border-b border-border bg-card">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="font-display text-xl font-bold">{t("chat.translate_to")}</h2>
            <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-lg text-muted-foreground active:bg-secondary" aria-label={t("common.close")}>
              <X className="size-4" />
            </button>
          </div>
          <div className="relative px-4 pb-3">
            <Search className="absolute left-7 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("lang.search")}
              autoFocus
              className="w-full rounded-xl border border-input bg-secondary/60 py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/60"
            />
          </div>
        </div>
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{t("lang.nothing_found")}</p>
        ) : (
          <div className="px-2 pt-2">
            {filtered.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => onPick(l.code)}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors active:bg-secondary"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary font-display text-sm font-bold uppercase text-muted-foreground">
                  {l.code.slice(0, 2)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{l.nativeName}</p>
                  <p className="text-xs text-muted-foreground">{l.name}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function formatLastSeen(raw: string, lang: string): string {
  const ts = parseIsoTs(raw)
  if (!Number.isFinite(ts)) return raw
  return relativeTime(ts, lang)
}

function relativeTime(ts: number, lang: string): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60_000)
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" })
  if (min < 1) return rtf.format(0, "minute")
  if (min < 60) return rtf.format(-min, "minute")
  const h = Math.floor(min / 60)
  if (h < 24) return rtf.format(-h, "hour")
  const d = Math.floor(h / 24)
  return rtf.format(-d, "day")
}
