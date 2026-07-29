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

export function chatIdForPair(id1: number | string, id2: number | string): string {
  const [a, b] = [String(id1), String(id2)].sort()
  return `dm-${a}-${b}`
}

let _chats: ChatPreview[] = []

export function useChats(): ChatPreview[] {
  const [chats, setChats] = useState<ChatPreview[]>([])
  const pollingRef = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    let cancelled = false
    async function load(attempt = 0) {
      try {
        const data: any = await api.get("/api/chat/list")
        if (cancelled) return
        const list: ChatPreview[] = (data.chats ?? []).map((c: any) => {
          const rawNick = c.other_nick
          const nick =
            typeof rawNick === "string" && rawNick.trim()
              ? rawNick.trim()
              : "Unknown"
          const rawAvatar = c.other_avatar
          const avatar = typeof rawAvatar === "string" ? rawAvatar : null
          const online = c.other_online === true
          const lastSeen = c.other_last_seen ?? null
          return {
            id: c.chat_id ?? c.id ?? "",
            player: {
              id: c.other_id ?? 0,
              nick,
              avatar,
              online,
              lastSeen,
            },
            lastText: c.last_text ?? "",
            lastTs: c.last_ts ? new Date(c.last_ts).getTime() : Date.now(),
            unread: c.unread ?? 0,
          }
        })
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
    pollingRef.current = setInterval(load, 10000)
    return () => {
      cancelled = true
      clearInterval(pollingRef.current)
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
  const optimisticIds = useRef<Set<string>>(new Set())
  const pollingRef = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    if (
      !chatId ||
      typeof chatId !== "string" ||
      chatId.includes("[object Promise]") ||
      chatId.includes("[object Object]")
    ) {
      setMessages([])
      optimisticIds.current.clear()
      return
    }
    let cancelled = false
    async function fetchMsgs(attempt = 0) {
      try {
        const data: any = await api.get("/api/chat/" + chatId)
        if (!cancelled) {
          const serverMsgs = (data.messages ?? []).map(mapMsg)
          const serverIds = new Set(serverMsgs.map((m: ChatMessage) => m.id))
          setMessages((prev) => {
            const kept = prev.filter((m) => m.id.startsWith("opt-") && !serverIds.has(m.id))
            return [...serverMsgs, ...kept]
          })
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
    optimisticIds.current.add(id)
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

export function openChatWithPlayer(myId: number | string, otherId: number | string): string {
  return chatIdForPair(myId, otherId)
}

export function getChatPlayer(chatId: string) {
  return _chats.find((c) => c.id === chatId)?.player
}
