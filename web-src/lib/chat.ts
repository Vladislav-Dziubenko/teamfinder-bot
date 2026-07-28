"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
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

export function chatIdForPlayer(playerId: string): string {
  return `dm-${playerId}`
}

let _chats: ChatPreview[] = []

export function useChats(): ChatPreview[] {
  const [chats, setChats] = useState<ChatPreview[]>([])

  useEffect(() => {
    api.get("/api/chat/list").then((data: { chats?: ChatPreview[] }) => {
      const list = data.chats ?? []
      setChats(list)
      _chats = list
    })
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

export function useChatMessages(chatId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [typing, setTyping] = useState(false)

  useEffect(() => {
    if (!chatId) {
      setMessages([])
      return
    }
    api.get("/api/chat/messages/" + chatId).then((data: { messages?: ChatMessage[] }) => setMessages(data.messages ?? []))
  }, [chatId])

  const sendMessage = useCallback(async (text: string) => {
    if (!chatId) return
    await api.post("/api/chat/send", { chat_id: chatId, text })
    setTyping(false)
  }, [chatId])

  return { messages, sendMessage, typing }
}

export async function sendMessageRaw(chatId: string, text: string): Promise<void> {
  await api.post("/api/chat/send", { chat_id: chatId, text })
}

export async function openChatWithPlayer(playerId: string): Promise<string> {
  const res = await api.get("/api/chat/create/" + playerId)
  return (res as { chatId?: string }).chatId ?? chatIdForPlayer(playerId)
}

export function getChatPlayer(chatId: string) {
  return _chats.find((c) => c.id === chatId)?.player
}
