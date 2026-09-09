"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { Loader2, MessagesSquare, Send } from "lucide-react"
import { cn } from "@/lib/utils"
import { BottomSheet } from "./bottom-sheet"

export type ForwardSource = {
  /** "global" или chat_id лички-источника. */
  fromChat: string
  items: { id: string; text: string }[]
}

type Target = { id: string; label: string; sub: string }

export function ForwardSheet({
  source,
  onClose,
  onDone,
}: {
  source: ForwardSource | null
  onClose: () => void
  onDone: (messages: any[], toChat: string) => void
}) {
  const { lang } = useI18n()
  const ru = lang === "ru"
  const [targets, setTargets] = useState<Target[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!source) return
    setLoading(true)
    setErr(null)
    api
      .get("/api/chat/list")
      .then((data: any) => {
        const list: Target[] = (data.chats ?? data?.messages ?? []).map((c: any) => {
          const rawNick = c.other_nick
          const nick =
            typeof rawNick === "string" && rawNick.trim() ? rawNick.trim() : ru ? "Без ника" : "Unknown"
          return {
            id: String(c.chat_id ?? c.id ?? ""),
            label: nick,
            sub: typeof c.last_text === "string" && c.last_text ? c.last_text.slice(0, 60) : "",
          }
        })
        setTargets(list.filter((t) => t.id))
      })
      .catch(() => setTargets([]))
      .finally(() => setLoading(false))
  }, [source, ru])

  const shown = source
  const preview = !shown
    ? ""
    : shown.items.length === 1
      ? shown.items[0].text
      : `${shown.items[0]?.text ?? ""} (+${shown.items.length - 1})`

  async function pick(to: string): Promise<void> {
    const src = shown
    if (sending || !src) return
    setSending(to)
    setErr(null)
    try {
      const done: any[] = []
      for (const it of src.items) {
        const res: any = await api.post("/api/messages/forward", {
          from: src.fromChat,
          message_id: it.id,
          to,
        })
        if (res?.message?.id != null) done.push(res.message)
      }
      if (done.length) {
        onDone(done, to)
        onClose()
      } else {
        setErr(ru ? "Не переслалось" : "Forward failed")
      }
    } catch (e: any) {
      setErr(e?.message || (ru ? "Не переслалось" : "Forward failed"))
    } finally {
      setSending(null)
    }
  }

  return (
    <BottomSheet
      open={source !== null}
      onClose={onClose}
      title={ru ? "Переслать" : "Forward"}
      autoFitKey={targets.length + (loading ? 1 : 0)}
      headerExtra={
        <p className="px-5 pb-2 text-xs text-muted-foreground line-clamp-2">
          {(preview || "").slice(0, 120)}
        </p>
      }
    >
      <div className="px-2">
          <button
            key="__global__"
            type="button"
            disabled={sending !== null}
            onClick={() => pick("global")}
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors active:bg-secondary disabled:opacity-60"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
              <MessagesSquare className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{ru ? "Общий чат" : "Global chat"}</span>
              <span className="block text-xs text-muted-foreground">{ru ? "Все игроки увидят" : "Visible to everyone"}</span>
            </span>
            {sending === "global" ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : <Send className="size-4 text-muted-foreground" />}
          </button>
          {loading && (
            <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> {ru ? "Загрузка чатов…" : "Loading chats…"}
            </p>
          )}
          {!loading &&
            targets.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={sending !== null}
                onClick={() => pick(t.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors active:bg-secondary disabled:opacity-60",
                )}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary font-display text-sm font-bold text-muted-foreground">
                  {(t.label || "?").charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{t.label}</span>
                  {!!t.sub && <span className="block truncate text-xs text-muted-foreground">{t.sub}</span>}
                </span>
                {sending === t.id ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : <Send className="size-4 text-muted-foreground" />}
              </button>
            ))}
          {!loading && targets.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {ru ? "Личек пока нет — можно в общий чат" : "No DMs yet — global chat works"}
            </p>
          )}
          {err && <p className="px-5 pt-1 text-center text-xs font-semibold text-destructive">{err}</p>}
        </div>
    </BottomSheet>
  )
}
