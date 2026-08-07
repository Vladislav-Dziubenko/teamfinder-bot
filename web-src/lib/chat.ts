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
  role?: string
}

/** Парсит ISO-строку из БД (без timezone) как UTC, чтобы даты были корректными. */
export function parseIsoTs(raw: string): number {
  if (!raw) return NaN
  const normalized = /[zZ]|[+-]\d\d:\d\d$/.test(raw) ? raw : raw + "Z"
  return new Date(normalized).getTime()
}

export function chatIdForPair(id1: number | string, id2: number | string): string {
  const [a, b] = [String(id1), String(id2)].sort()
  return `dm-${a}-${b}`
}

let _chats: ChatPreview[] = []

export function useChats(): ChatPreview[] {
  const [chats, setChats] = useState<ChatPreview[]>(_chats)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
            lastTs: c.last_ts ? parseIsoTs(c.last_ts) : Date.now(),
            unread: c.unread ?? 0,
            role: c.other_role ?? "",
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
    const id = setInterval(load, 15000)
    pollingRef.current = id

    // Пауза при сворачивании вкладки — не опрашиваем сервер в фоне.
    function onVisibility() {
      if (document.hidden) {
        if (pollingRef.current) clearInterval(pollingRef.current)
      } else {
        load()
        pollingRef.current = setInterval(load, 15000)
      }
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      cancelled = true
      if (pollingRef.current) clearInterval(pollingRef.current)
      document.removeEventListener("visibilitychange", onVisibility)
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
    ts: m.created_at ? parseIsoTs(m.created_at) : Date.now(),
    status: m.read_at ? "read" : "sent",
  }
}

const _msgCache = new Map<string, ChatMessage[]>()

export type ChatStatus = {
  muted: boolean
  blocked: boolean
  blockedByOther: boolean
}

export function useChatMessages(chatId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>(chatId ? _msgCache.get(chatId) ?? [] : [])
  const [status, setStatus] = useState<ChatStatus>({ muted: false, blocked: false, blockedByOther: false })
  const [typing, setTyping] = useState(false)
  const optimisticIds = useRef<Set<string>>(new Set())
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
    setMessages(_msgCache.get(chatId) ?? [])
    setStatus({ muted: false, blocked: false, blockedByOther: false })
    let cancelled = false
    const cid: string = chatId
    async function fetchMsgs(attempt = 0) {
      try {
        const data: any = await api.get("/api/chat/" + cid)
        if (!cancelled) {
          if (data.status) {
            setStatus({
              muted: Boolean(data.status.muted),
              blocked: Boolean(data.status.blocked),
              blockedByOther: Boolean(data.status.blocked_by_other),
            })
          }
          const serverMsgs = (data.messages ?? []).map(mapMsg)
          const serverIds = new Set(serverMsgs.map((m: ChatMessage) => m.id))
          setMessages((prev) => {
            const kept = prev.filter((m) => m.id.startsWith("opt-") && !serverIds.has(m.id))
            const merged = [...serverMsgs, ...kept]
            _msgCache.set(cid, merged)
            return merged
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
    const id = setInterval(fetchMsgs, 10000)
    pollingRef.current = id

    function onVisibility() {
      if (document.hidden) {
        if (pollingRef.current) clearInterval(pollingRef.current)
      } else {
        fetchMsgs()
        pollingRef.current = setInterval(fetchMsgs, 10000)
      }
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      cancelled = true
      if (pollingRef.current) clearInterval(pollingRef.current)
      document.removeEventListener("visibilitychange", onVisibility)
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
      const res: any = await api.post("/api/chat/" + chatId + "/send", { text })
      if (res?.message?.id != null) {
        const real: ChatMessage = {
          id: String(res.message.id),
          chatId,
          senderId: "me",
          text: res.message.text ?? text,
          ts: res.message.created_at ? parseIsoTs(res.message.created_at) : Date.now(),
          status: "sent",
        }
        setMessages((prev) => {
          const merged = prev.map((m) => (m.id === id ? real : m))
          _msgCache.set(chatId, merged)
          return merged
        })
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== id))
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== id))
    }
  }, [chatId])

  const clearChat = useCallback(async () => {
    if (!chatId) return
    try {
      await api.post("/api/chat/" + chatId + "/clear")
    } catch {}
    setMessages([])
    optimisticIds.current.clear()
    _msgCache.set(chatId, [])
  }, [chatId])

  const blockUser = useCallback(async () => {
    if (!chatId) return
    try {
      await api.post("/api/chat/" + chatId + "/block")
      setStatus((s) => ({ ...s, blocked: true, blockedByOther: false }))
    } catch {}
  }, [chatId])

  const unblockUser = useCallback(async () => {
    if (!chatId) return
    try {
      await api.post("/api/chat/" + chatId + "/unblock")
      setStatus((s) => ({ ...s, blocked: false, blockedByOther: false }))
    } catch {}
  }, [chatId])

  const muteChat = useCallback(async () => {
    if (!chatId) return
    try {
      await api.post("/api/chat/" + chatId + "/mute")
      setStatus((s) => ({ ...s, muted: true }))
    } catch {}
  }, [chatId])

  const unmuteChat = useCallback(async () => {
    if (!chatId) return
    try {
      await api.post("/api/chat/" + chatId + "/unmute")
      setStatus((s) => ({ ...s, muted: false }))
    } catch {}
  }, [chatId])

  return { messages, status, sendMessage, typing, clearChat, blockUser, unblockUser, muteChat, unmuteChat }
}

export async function sendMessageRaw(chatId: string, text: string): Promise<void> {
  await api.post("/api/chat/" + chatId + "/send", { text })
}

export type GlobalMessage = {
  id: string
  userId: string
  text: string
  ts: number
  nick: string
  avatar: string
  role?: string
  deco?: string
  kind?: "user" | "system"
}

const _globalCache: GlobalMessage[] = []
let _globalLoaded = false

/** Тёплый кэш: предзагружает глобальный чат при монтировании таба, чтобы он открывался мгновенно. */
export function preloadGlobalChat(): void {
  if (_globalLoaded) return
  _globalLoaded = true
  api.get("/api/global").catch(() => {}).then((data: any) => {
    if (!data) return
    const list: GlobalMessage[] = (data.messages ?? []).map(mapGlobalMsg)
    _globalCache.length = 0
    _globalCache.push(...list)
  })
}

function mapGlobalMsg(m: any): GlobalMessage {
  return {
    id: String(m.id ?? ""),
    userId: m.user_id === "me" ? "me" : String(m.user_id ?? ""),
    text: m.text ?? "",
    ts: m.created_at ? parseIsoTs(m.created_at) : Date.now(),
    nick: m.nick || (m.user_id === "me" ? "You" : "Player"),
    avatar: m.avatar ?? null,
    role: m.role ?? "",
    deco: m.deco ?? "",
    kind: m.kind === "system" ? "system" : "user",
  }
}

export function useGlobalChat() {
  const [messages, setMessages] = useState<GlobalMessage[]>(_globalCache)
  const [meRole, setMeRole] = useState<string>("")
  const [meBanned, setMeBanned] = useState(false)
  const [sending, setSending] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load(attempt = 0) {
      try {
        const data: any = await api.get("/api/global")
        if (cancelled) return
        setMeRole(data.me_role ?? "")
        setMeBanned(Boolean(data.me_banned))
        const list: GlobalMessage[] = (data.messages ?? []).map(mapGlobalMsg)
        setMessages(list)
        _globalCache.length = 0
        _globalCache.push(...list)
      } catch (e: any) {
        if (e?.status === 503 && attempt < 10 && !cancelled) {
          await new Promise((r) => setTimeout(r, 1000 + attempt * 500))
          return load(attempt + 1)
        }
      }
    }
    load()
    const id = setInterval(load, 10000)
    pollRef.current = id

    function onVisibility() {
      if (document.hidden) {
        if (pollRef.current) clearInterval(pollRef.current)
      } else {
        load()
        pollRef.current = setInterval(load, 10000)
      }
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      cancelled = true
      if (pollRef.current) clearInterval(pollRef.current)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  const sendGlobal = useCallback(async (text: string): Promise<boolean> => {
    if (!text.trim() || sending) return false
    setSending(true)
    try {
      const res: any = await api.post("/api/global/send", { text })
      if (res?.message?.id != null) {
        const msg: GlobalMessage = {
          id: String(res.message.id),
          userId: "me",
          text: res.message.text ?? text,
          ts: res.message.created_at ? parseIsoTs(res.message.created_at) : Date.now(),
          nick: "You",
          avatar: "",
          role: meRole,
        }
        setMessages((prev) => [...prev, msg])
        _globalCache.push(msg)
        return true
      }
    } catch {
      return false
    } finally {
      setSending(false)
    }
    return false
  }, [sending, meRole])

  const deleteMessage = useCallback(async (id: string) => {
    try {
      await api.post("/api/global/delete", { message_id: id })
    } catch {}
    setMessages((prev) => prev.filter((m) => m.id !== id))
    const i = _globalCache.findIndex((m) => m.id === id)
    if (i >= 0) _globalCache.splice(i, 1)
  }, [])

  const banUser = useCallback(async (userId: string, reason = "") => {
    try {
      await api.post("/api/global/ban", { user_id: userId, reason })
      return { ok: true, error: "" }
    } catch (e: any) {
      return { ok: false, error: e?.message || "error" }
    }
  }, [])

  const unbanUser = useCallback(async (userId: string) => {
    try {
      await api.post("/api/global/unban", { user_id: userId })
      return { ok: true, error: "" }
    } catch (e: any) {
      return { ok: false, error: e?.message || "error" }
    }
  }, [])

  return { messages, meRole, meBanned, sendGlobal, sending, deleteMessage, banUser, unbanUser }
}

export function openChatWithPlayer(myId: number | string, otherId: number | string): string {
  return chatIdForPair(myId, otherId)
}

export function getChatPlayer(chatId: string) {
  return _chats.find((c) => c.id === chatId)?.player
}
