"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { api } from "@/lib/api"
import type { Player } from "@/lib/data"

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

export function chatIdForPlayer(playerId: string): string {
  return `dm-${playerId}`
}

const listeners = new Set<() => void>()
let chatsCache: ChatPreview[] = []

function emit() {
  listeners.forEach((l) => l())
}

export function useChats(): ChatPreview[] {
  const [, force] = useState(0)

  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    api.get("/api/chat/list").then((data) => {
      chatsCache = (data.chats || []).map((c: any) => ({
        id: c.chat_id,
        player: { id: c.chat_id.replace("dm-", ""), nick: c.chat_id, avatar: "/placeholder.svg", online: false, lastSeen: "" },
        lastText: c.last_text,
        lastTs: new Date(c.last_ts).getTime(),
        unread: c.unread,
      }))
      emit()
    }).catch(() => {})
    return () => {
      listeners.delete(l)
    }
  }, [])

  return useMemo(() => [...chatsCache].sort((a, b) => b.lastTs - a.lastTs), [chatsCache.length])
}

export function useTotalUnread(): number {
  const chats = useChats()
  return chats.reduce((sum, c) => sum + c.unread, 0)
}

export function useChatMessages(chatId: string | null) {
  const [, force] = useState(0)
  const [typing, setTyping] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])

  useEffect(() => {
    if (!chatId) return
    api.get(`/api/chat/${chatId}`).then((data) => {
      setMessages((data.messages || []).map((m: any) => ({
        id: String(m.id),
        chatId: m.chat_id,
        senderId: String(m.sender_id),
        text: m.text,
        ts: new Date(m.created_at).getTime(),
      })))
    }).catch(() => {})
  }, [chatId])

  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])

  // сброс непрочитанных при открытии диалога
  useEffect(() => {
    if (!chatId) return
    const chat = chatsCache.find((c) => c.id === chatId)
    if (chat && chat.unread > 0) {
      chat.unread = 0
      emit()
    }
  }, [chatId])

  const sendMessage = useCallback(
    async (text: string) => {
      const clean = text.trim()
      if (!clean || !chatId) return
      try {
        await api.post(`/api/chat/${chatId}/send`, { text: clean })
        const fresh = await api.get(`/api/chat/${chatId}`)
        setMessages((fresh.messages || []).map((m: any) => ({
          id: String(m.id),
          chatId: m.chat_id,
          senderId: String(m.sender_id),
          text: m.text,
          ts: new Date(m.created_at).getTime(),
        })))
      } catch (e) {
        console.error("Failed to send message", e)
      }
    },
    [chatId],
  )

  return { messages, sendMessage, typing }
}

export function openChatWithPlayer(playerId: string): string {
  const id = chatIdForPlayer(playerId)
  if (!chatsCache.some((c) => c.id === id)) {
    chatsCache = [
      {
        id,
        player: { id: playerId, nick: `Player ${playerId}`, avatar: "/placeholder.svg", online: false, lastSeen: "" },
        lastText: "Начните диалог",
        lastTs: Date.now(),
        unread: 0,
      },
      ...chatsCache,
    ]
  }
  emit()
  return id
}

export function getChatPlayer(chatId: string) {
  return chatsCache.find((c) => c.id === chatId)?.player
}
