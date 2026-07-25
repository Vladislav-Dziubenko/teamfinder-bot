"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { players, type Player } from "@/lib/data"
// import { api } from "@/lib/api" // ← точка интеграции с реальным API/WebSocket

/* ------------------------------------------------------------------ *
 *  Чат внутри Mini App
 *
 *  Сейчас данные замоканы на фронте. Для подключения реального бэкенда
 *  замените тела useChats / useChatMessages на запросы через api.get/api.post
 *  и WebSocket-подписку. Публичный интерфейс хуков менять НЕ нужно —
 *  компоненты (chat-tab.tsx) продолжат работать без изменений.
 * ------------------------------------------------------------------ */

export type ChatMessage = {
  id: string
  chatId: string
  /** "me" — исходящее сообщение, иначе id собеседника */
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

const ME = "me"

/** id диалога с конкретным игроком (детерминированный, чтобы совпадал у match-tab) */
export function chatIdForPlayer(playerId: string): string {
  return `dm-${playerId}`
}

/* ---------------- Мок-данные ---------------- */

function playerLite(id: string) {
  const p = players.find((x) => x.id === id)!
  return { id: p.id, nick: p.nick, avatar: p.avatar, online: p.online, lastSeen: p.lastSeen }
}

const MIN = 60_000

const seedChats: ChatPreview[] = [
  {
    id: chatIdForPlayer("2"),
    player: playerLite("2"),
    lastText: "Го катку вечером, я за дуэлянта",
    lastTs: Date.now() - 4 * MIN,
    unread: 2,
  },
  {
    id: chatIdForPlayer("1"),
    player: playerLite("1"),
    lastText: "Скинь ник на фейсите",
    lastTs: Date.now() - 55 * MIN,
    unread: 0,
  },
  {
    id: chatIdForPlayer("4"),
    player: playerLite("4"),
    lastText: "Ok, добавляй в пати 👍",
    lastTs: Date.now() - 3 * 60 * MIN,
    unread: 0,
  },
]

const seedMessages: Record<string, ChatMessage[]> = {
  [chatIdForPlayer("2")]: [
    { id: "m1", chatId: chatIdForPlayer("2"), senderId: "2", text: "Привет! Видел твою анкету по валику", ts: Date.now() - 20 * MIN },
    { id: "m2", chatId: chatIdForPlayer("2"), senderId: ME, text: "Привет) Да, ищу стак на ранкед", ts: Date.now() - 18 * MIN, status: "read" },
    { id: "m3", chatId: chatIdForPlayer("2"), senderId: "2", text: "Го катку вечером, я за дуэлянта", ts: Date.now() - 4 * MIN },
    { id: "m4", chatId: chatIdForPlayer("2"), senderId: "2", text: "Часов в 8 удобно?", ts: Date.now() - 4 * MIN },
  ],
  [chatIdForPlayer("1")]: [
    { id: "n1", chatId: chatIdForPlayer("1"), senderId: ME, text: "Здарова, возьмёшь пятым на фейсит?", ts: Date.now() - 70 * MIN, status: "read" },
    { id: "n2", chatId: chatIdForPlayer("1"), senderId: "1", text: "Скинь ник на фейсите", ts: Date.now() - 55 * MIN },
  ],
  [chatIdForPlayer("4")]: [
    { id: "d1", chatId: chatIdForPlayer("4"), senderId: ME, text: "Го дотку", ts: Date.now() - 200 * MIN, status: "read" },
    { id: "d2", chatId: chatIdForPlayer("4"), senderId: "4", text: "Ok, добавляй в пати 👍", ts: Date.now() - 180 * MIN },
  ],
}

/* ---------------- Простое in-memory хранилище ---------------- */

let chatsStore: ChatPreview[] = seedChats.map((c) => ({ ...c }))
const messagesStore: Record<string, ChatMessage[]> = JSON.parse(JSON.stringify(seedMessages))
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

function ensureChat(playerId: string) {
  const id = chatIdForPlayer(playerId)
  if (!messagesStore[id]) messagesStore[id] = []
  if (!chatsStore.some((c) => c.id === id)) {
    chatsStore = [
      {
        id,
        player: playerLite(playerId),
        lastText: "Начните диалог",
        lastTs: Date.now(),
        unread: 0,
      },
      ...chatsStore,
    ]
  }
}

/* ---------------- Хуки (публичный API для компонентов) ---------------- */

export function useChats(): ChatPreview[] {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  return useMemo(() => [...chatsStore].sort((a, b) => b.lastTs - a.lastTs), [chatsStore.length, chatsStore.map((c) => c.lastTs).join()])
}

export function useTotalUnread(): number {
  const chats = useChats()
  return chats.reduce((sum, c) => sum + c.unread, 0)
}

/**
 * Основная точка интеграции. Сейчас: мок + локальный автo-ответ «печатает…».
 * Позже: заменить на реальные сообщения из api.get(`/api/chat/${chatId}`)
 * и подписку на WebSocket для входящих.
 */
export function useChatMessages(chatId: string | null) {
  const [, force] = useState(0)
  const [typing, setTyping] = useState(false)
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    const chat = chatsStore.find((c) => c.id === chatId)
    if (chat && chat.unread > 0) {
      chat.unread = 0
      emit()
    }
  }, [chatId])

  useEffect(() => {
    return () => {
      if (replyTimer.current) clearTimeout(replyTimer.current)
    }
  }, [])

  const messages = chatId ? messagesStore[chatId] ?? [] : []

  const sendMessage = useCallback(
    (text: string) => {
      const clean = text.trim()
      if (!clean || !chatId) return

      // TODO(api): await api.post(`/api/chat/${chatId}/send`, { text: clean })
      const msg: ChatMessage = {
        id: `${chatId}-${Date.now()}`,
        chatId,
        senderId: ME,
        text: clean,
        ts: Date.now(),
        status: "sent",
      }
      messagesStore[chatId] = [...(messagesStore[chatId] ?? []), msg]
      const chat = chatsStore.find((c) => c.id === chatId)
      if (chat) {
        chat.lastText = clean
        chat.lastTs = msg.ts
      }
      emit()

      // Демо-имитация ответа собеседника + индикатор «печатает…».
      // На реальном бэкенде это придёт через WebSocket, а не здесь.
      setTyping(true)
      replyTimer.current = setTimeout(() => {
        const replies = ["Понял, го!", "Ок 👍", "Договорились", "Скинь ссылку на пати", "Через 10 минут буду"]
        const otherId = chatId.replace("dm-", "")
        const reply: ChatMessage = {
          id: `${chatId}-${Date.now()}-r`,
          chatId,
          senderId: otherId,
          text: replies[Math.floor(Math.random() * replies.length)],
          ts: Date.now(),
        }
        messagesStore[chatId] = [...(messagesStore[chatId] ?? []), reply]
        const c = chatsStore.find((x) => x.id === chatId)
        if (c) {
          c.lastText = reply.text
          c.lastTs = reply.ts
        }
        setTyping(false)
        emit()
      }, 1600)
    },
    [chatId],
  )

  return { messages, sendMessage, typing }
}

/** Открыть (или создать) диалог с игроком — вызывается из match-tab */
export function openChatWithPlayer(playerId: string): string {
  ensureChat(playerId)
  emit()
  return chatIdForPlayer(playerId)
}

export function getChatPlayer(chatId: string) {
  return chatsStore.find((c) => c.id === chatId)?.player
}
