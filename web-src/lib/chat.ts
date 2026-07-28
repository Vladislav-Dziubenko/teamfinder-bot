"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Player } from "@/lib/data"
import { api } from "@/lib/api"

export type ChatMessage = {
  id: string
  chatId: string
  senderId: string
  text: string
  ts: number
  status?: "sent" | "read"
}

export type ChatPreview = {
  id: string
  player: Pick<Player, "id" | "nick" | "avatar" | "online" | "lastSeen">
  lastText: string
  lastTs: number
  unread: number
}

export function chatIdForPlayer(playerId: number | string): string {
  if (typeof playerId !== "number" && typeof playerId !== "string") {
    console.error("chatIdForPlayer received non-primitive:", playerId)
    return ""
  }
  return `dm-${playerId}`
}

let _chats: ChatPreview[] = []

export function useChats(): ChatPreview[] {
  const [chats, setChats] = useState<ChatPreview[]>([])

  useEffect(() => {
    let cancelled = false
    async function load(attempt = 0) {
      try {
        const data: any = await api.get("/api/chat/list")
        if (cancelled) return
        const list: ChatPreview[] = (data.chats ?? []).map((c: any) => ({
          id: c.chat_id ?? c.id ?? "",
          player: {
            id: c.other_id ?? 0,
            nick: c.other_nick ?? "Unknown",
            avatar: c.other_avatar ?? null,
            online: false,
            lastSeen: null,
          },
          lastText: c.last_text ?? "",
          lastTs: c.last_ts ? new Date(c.last_ts).getTime() : Date.now(),
          unread: c.unread ?? 0,
        }))
        setChats(list)
        _chats = list
      } catch (e: any) {
        if (e?.status === 503 && attempt < 10 && !cancelled) {
          await new Promise((r) => setTimeout(r, 1000 + attempt * 500))
          return load(attempt + 1)
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return chats
}

export function useTotalUnread(): number {
  const chats = useChats()
  return useMemo(() => chats.reduce((sum, c) => sum + c.unread, 0), [chats])
}

export function useUnreadCount(chatId: string): number {
  const chats = useChats()
  return useMemo(() => chats.find((c) => c.id === chatId)?.unread ?? 0, [chats, chatId])
}

function mapMsg(m: any): ChatMessage {
  return {
    id: String(m.id ?? ""),
    chatId: m.chat_id ?? "",
    senderId: m.sender_id === "me" ? "me" : String(m.sender_id ?? ""),
    text: m.text ?? "",
    ts: m.created_at ? new Date(m.created_at).getTime() : Date.now(),
    status: "sent",
  }
}

export function useChatMessages(chatId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [typing, setTyping] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    if (!chatId || chatId === "[object Promise]" || chatId === "[object Object]") {
      setMessages([])
      return
    }
    let cancelled = false
    async function fetchMsgs(attempt = 0) {
      try {
        const data: any = await api.get("/api/chat/" + chatId)
        if (!cancelled) {
          setMessages((data.messages ?? []).map(mapMsg))
        }
      } catch (e: any) {
        if (e?.status === 503 && attempt < 10 && !cancelled) {
          await new Promise((r) => setTimeout(r, 1000 + attempt * 500))
          return fetchMsgs(attempt + 1)
        }
      }
    }
    fetchMsgs()
    pollingRef.current = setInterval(fetchMsgs, 5000)
    return () => {
      cancelled = true
      clearInterval(pollingRef.current)
    }
  }, [chatId])

  const sendMessage = useCallback(async (text: string) => {
    if (!chatId) return
    const id = "opt-" + Date.now()
    const optimistic: ChatMessage = {
      id,
      chatId,
      senderId: "me",
      text,
      ts: Date.now(),
      status: "sent",
    }
    setMessages((prev) => [...prev, optimistic])
    try {
      await api.post("/api/chat/" + chatId + "/send", { text })
    } catch {}
  }, [chatId])

  return { messages, sendMessage, typing }
}

export async function sendMessageRaw(chatId: string, text: string): Promise<void> {
  await api.post("/api/chat/" + chatId + "/send", { text })
}

export function openChatWithPlayer(playerId: number | string): string {
  return chatIdForPlayer(playerId)
}

export function getChatPlayer(chatId: string) {
  return _chats.find((c) => c.id === chatId)?.player
}
