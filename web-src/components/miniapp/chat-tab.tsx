"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronLeft, Send, MessagesSquare, CheckCheck, Check } from "lucide-react"
import {
  getChatPlayer,
  useChatMessages,
  useChats,
  type ChatPreview,
} from "@/lib/chat"
import { cn } from "@/lib/utils"

export function ChatTab({
  openChatId,
  onOpenConsumed,
}: {
  openChatId?: string | null
  onOpenConsumed?: () => void
}) {
  const [activeId, setActiveId] = useState<string | null>(openChatId ?? null)
  const chats = useChats()

  useEffect(() => {
    if (openChatId) {
      setActiveId(openChatId)
      onOpenConsumed?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openChatId])

  if (activeId) {
    return <ChatConversation chatId={activeId} onBack={() => setActiveId(null)} />
  }

  return (
    <div className="space-y-4 px-4 py-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Сообщения</h1>
        <p className="text-sm text-muted-foreground text-pretty">Общайся с тиммейтами прямо в приложении</p>
      </div>

      {chats.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border py-12 text-center">
          <MessagesSquare className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-2 font-display text-lg font-bold">Пока нет диалогов</p>
          <p className="text-sm text-muted-foreground">Напиши игроку из поиска тиммейтов</p>
        </div>
      ) : (
        <div className="space-y-2">
          {chats.map((c) => (
            <ChatRow key={c.id} chat={c} onClick={() => setActiveId(c.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

function ChatRow({ chat, onClick }: { chat: ChatPreview; onClick: () => void }) {
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
          <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(chat.lastTs)}</span>
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

function ChatConversation({ chatId, onBack }: { chatId: string; onBack: () => void }) {
  const player = getChatPlayer(chatId)
  const { messages, sendMessage, typing } = useChatMessages(chatId)
  const [draft, setDraft] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages.length, typing])

  function submit() {
    if (!draft.trim()) return
    sendMessage(draft)
    setDraft("")
  }

  return (
    <div className="fixed inset-x-0 top-0 bottom-[60px] z-50 mx-auto flex max-w-md flex-col bg-background pb-[env(safe-area-inset-bottom)]">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border bg-card/85 px-3 py-3 backdrop-blur-xl">
        <button
          type="button"
          onClick={onBack}
          aria-label="Назад к диалогам"
          className="grid size-9 place-items-center rounded-full text-muted-foreground active:scale-90"
        >
          <ChevronLeft className="size-5" />
        </button>
        <img
          src={player?.avatar || "/placeholder.svg"}
          alt={player?.nick ?? "Игрок"}
          className="size-9 rounded-full object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-bold">{player?.nick ?? "Игрок"}</p>
          <p className="text-[11px] text-accent">
            {typing ? "печатает…" : player?.online ? "в сети" : player?.lastSeen ?? "не в сети"}
          </p>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {messages.map((m) => {
          const mine = m.senderId === "me"
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[78%] rounded-2xl px-3 py-2 text-sm",
                  mine
                    ? "rounded-br-md bg-primary text-primary-foreground"
                    : "rounded-bl-md border border-border bg-card text-card-foreground",
                )}
              >
                <p className="text-pretty leading-relaxed">{m.text}</p>
                <span
                  className={cn(
                    "mt-1 flex items-center justify-end gap-1 text-[10px]",
                    mine ? "text-primary-foreground/70" : "text-muted-foreground",
                  )}
                >
                  {clockTime(m.ts)}
                  {mine &&
                    (m.status === "read" ? <CheckCheck className="size-3" /> : <Check className="size-3" />)}
                </span>
              </div>
            </div>
          )
        })}

        {typing && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-border bg-card px-3 py-3">
              <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 border-t border-border bg-card/85 px-3 py-2.5 backdrop-blur-xl">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="Сообщение…"
          className="min-w-0 flex-1 rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!draft.trim()}
          aria-label="Отправить"
          className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground transition-transform active:scale-90 disabled:opacity-40"
        >
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

function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60_000)
  if (min < 1) return "сейчас"
  if (min < 60) return `${min} мин`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} ч`
  return `${Math.floor(h / 24)} дн`
}
