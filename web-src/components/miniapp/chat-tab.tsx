"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, Send, Smile, Sticker, MessagesSquare, CheckCheck, Check, Languages, Loader2 } from "lucide-react"
import {
  useChatMessages,
  useChats,
  type ChatPreview,
} from "@/lib/chat"
import { useI18n } from "@/lib/i18n"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

import type { Player } from "@/lib/data"

export function ChatTab({
  openChatId,
  openPlayer,
  onOpenConsumed,
}: {
  openChatId?: string | null
  openPlayer?: Player
  onOpenConsumed?: () => void
}) {
  const { t } = useI18n()
  const [activeId, setActiveId] = useState<string | null>(openChatId ?? null)
  const playerRef = useRef<Player | undefined>(openPlayer)
  const chats = useChats()

  // Keep the latest openPlayer so it doesn't get lost when parent consumes it
  if (openPlayer) playerRef.current = openPlayer

  useEffect(() => {
    if (openChatId) {
      setActiveId(openChatId)
      onOpenConsumed?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    return <ChatConversation chatId={activeId} player={player} onBack={closeChat} />
  }

  return (
    <div className="space-y-4 px-4 py-5">
      <div>
        <h1 className="font-display text-2xl font-bold">{t("chat.title")}</h1>
        <p className="text-sm text-muted-foreground text-pretty">{t("chat.subtitle")}</p>
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
          <p className="truncate font-display text-sm font-bold">{chat.player.nick}</p>
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
}

const MessageBubble = React.memo(function MessageBubble({ message: m, mine }: { message: Message; mine: boolean }) {
  const { t, lang } = useI18n()
  const [translated, setTranslated] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function doTranslate() {
    setLoading(true)
    try {
      const res = await api.post("/api/translate", { text: m.text, target: lang })
      setTranslated(res.translated ?? null)
    } catch {}
    setLoading(false)
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

function ChatConversation({ chatId, player, onBack }: { chatId: string; player?: ChatPreview["player"]; onBack: () => void }) {
  const { t } = useI18n()
  const { messages, sendMessage, typing } = useChatMessages(chatId)
  const [draft, setDraft] = useState("")
  const [showEmoji, setShowEmoji] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages.length, typing])

  const emojis = useMemo(
    () => ["😀","😂","🥰","😎","🤔","😢","😡","🔥","⭐","💯","❤️","👍","🎉","✨","💪","🙏","😢","🤗","🤩","💀"],
    [],
  )

  function insertEmoji(emoji: string) {
    setDraft((d) => d + emoji)
    inputRef.current?.focus()
  }

  function openStickerPanel() {
    inputRef.current?.focus()
  }

  function submit() {
    if (!draft.trim()) return
    sendMessage(draft)
    setDraft("")
  }

  return (
    <div className="fixed inset-x-0 top-0 bottom-[60px] z-50 mx-auto flex max-w-md flex-col bg-background pb-[env(safe-area-inset-bottom)]">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border bg-card/85 px-3 py-3 backdrop-blur-xl">
        <button type="button" onClick={onBack} aria-label={t("chat.back")} className="grid size-9 place-items-center rounded-full text-muted-foreground active:scale-90">
          <ChevronLeft className="size-5" />
        </button>
        <img src={player?.avatar || "/placeholder.svg"} alt={player?.nick ?? t("common.unknown")} className="size-9 rounded-full object-cover" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-bold">{player?.nick ?? t("common.unknown")}</p>
          <p className="text-[11px] text-accent">
            {typing ? t("common.typing") : player?.online ? t("common.online") : player?.lastSeen ?? t("common.offline")}
          </p>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {messages.map((m) => {
          const mine = m.senderId === "me"
          return <MessageBubble key={m.id} message={m} mine={mine} />
        })}
        {typing && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-border bg-card px-3 py-3">
              <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
            </div>
          </div>
        )}
      </div>

      {/* Emoji strip */}
      {showEmoji && (
        <div className="flex flex-wrap gap-1.5 border-t border-border bg-card/85 px-3 py-2 backdrop-blur-xl">
          {emojis.map((e) => (
            <button key={e} type="button" onClick={() => insertEmoji(e)} className="grid size-9 place-items-center rounded-lg text-lg active:scale-90">
              {e}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-2 border-t border-border bg-card/85 px-3 py-2.5 backdrop-blur-xl">
        <button type="button" onClick={() => setShowEmoji((v) => !v)} aria-label={t("chat.emoji")} className="grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground active:scale-90">
          <Smile className="size-5" />
        </button>
        <button type="button" onClick={openStickerPanel} aria-label={t("chat.sticker")} className="grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground active:scale-90">
          <Sticker className="size-5" />
        </button>
        <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); submit() } }} placeholder={t("chat.input_placeholder")} className="min-w-0 flex-1 rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/50" />
        <button type="button" onClick={submit} disabled={!draft.trim()} aria-label={t("common.send")} className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground transition-transform active:scale-90 disabled:opacity-40">
          <Send className="size-5" />
        </button>
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

function formatMsgTime(ts: number, lang: string): string {
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
