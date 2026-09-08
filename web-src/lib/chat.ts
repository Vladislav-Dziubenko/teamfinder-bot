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
  isVoice?: boolean
  voiceDuration?: number
  voiceMime?: string
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
        preloadTopChat(list)
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
    isVoice: Boolean(m.is_voice ?? m.isVoice ?? false),
    voiceDuration: Number(m.voice_duration ?? m.voiceDuration ?? 0) || 0,
    voiceMime: String(m.voice_mime ?? m.voiceMime ?? "audio/webm"),
  }
}

/** Убирает дубли по id (побеждает последняя версия) и сортирует по ts ↑
 * (фолбэк — числовой id). Чинит «старые как новые»: без сортировки
 * keptOld из пагинации оказывался в конце списка, а гонка
 * «полл между POST и заменой opt-» давала два сообщения с одним id. */
function dedupeAndSort<T extends { id: string; ts: number }>(list: T[]): T[] {
  const byId = new Map<string, T>()
  for (const m of list) {
    if (!m || !m.id) continue
    byId.set(m.id, m)
  }
  return Array.from(byId.values()).sort((a, b) => {
    const ta = Number.isFinite(a.ts) ? a.ts : 0
    const tb = Number.isFinite(b.ts) ? b.ts : 0
    if (ta !== tb) return ta - tb
    const ia = parseInt(a.id, 10)
    const ib = parseInt(b.id, 10)
    if (!isNaN(ia) && !isNaN(ib)) return ia - ib
    return a.id < b.id ? -1 : 1
  })
}

const _msgCache = new Map<string, ChatMessage[]>()

const _prefetchedChats = new Set<string>()

/**
 * Тёплый кэш: после загрузки списка чатов сразу качаем сообщения самого
 * свежего диалога (и периодически — следующего), чтобы открытие чата
 * происходило мгновенно, без спиннера.
 */
function preloadTopChat(list: ChatPreview[]): void {
  const top = [...list].sort((a, b) => b.lastTs - a.lastTs).find((c) => !_prefetchedChats.has(c.id))
  if (!top || _msgCache.has(top.id)) return
  _prefetchedChats.add(top.id)
  api
    .get("/api/chat/" + top.id)
    .then((data: any) => {
      const msgs: ChatMessage[] = (data?.messages ?? []).map(mapMsg)
      if (msgs.length) _msgCache.set(top.id, msgs)
    })
    .catch(() => _prefetchedChats.delete(top.id))
}

export type ChatStatus = {
  muted: boolean
  blocked: boolean
  blockedByOther: boolean
}

export function useChatMessages(chatId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>(chatId ? _msgCache.get(chatId) ?? [] : [])
  const [status, setStatus] = useState<ChatStatus>({ muted: false, blocked: false, blockedByOther: false })
  const [typing, setTyping] = useState(false)
  const [loadingEarlier, setLoadingEarlier] = useState(false)
  const [hasMore, setHasMore] = useState(true)
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
      setHasMore(true)
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
            // Сохраняем при поллинге: оптимистичные сообщения (не пришедшие
            // с сервера) и ранее догруженные пагинацией старые сообщения —
            // иначе после каждого poll-запроса история обрезалась бы до 50.
            const firstServer = serverMsgs
              .map((m: ChatMessage) => parseInt(m.id, 10))
              .filter((n: number) => !isNaN(n))
              .reduce((a: number, b: number) => (a === 0 ? b : Math.min(a, b)), 0)
            const keptOld = prev.filter((m) => {
              if (m.id.startsWith("opt-")) return false
              if (serverIds.has(m.id)) return false
              const idNum = parseInt(m.id, 10)
              return !isNaN(idNum) && firstServer > 0 && idNum < firstServer
            })
            const keptOpt = prev.filter((m) => m.id.startsWith("opt-") && !serverIds.has(m.id))
            // dedupeAndSort: старые из пагинации встают наверх по ts,
            // а дубль «полл + ещё не заменённый opt-» схлопывается.
            const merged = dedupeAndSort([...serverMsgs, ...keptOpt, ...keptOld])
            _msgCache.set(cid, merged)
            return merged
          })
          setHasMore(data.has_more ?? false)
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

  const loadEarlier = useCallback(async () => {
    if (!chatId || loadingEarlier || !hasMore) return
    setLoadingEarlier(true)
    try {
      const firstMsg = messages[0]
      if (!firstMsg || firstMsg.id.startsWith("opt-")) return
      const beforeId = parseInt(firstMsg.id, 10)
      if (isNaN(beforeId)) return
      const data: any = await api.get(`/api/chat/${chatId}?before_id=${beforeId}`)
      const olderMsgs = (data.messages ?? []).map(mapMsg)
      if (olderMsgs.length) {
        setMessages((prev) => {
          const merged = dedupeAndSort([...olderMsgs, ...prev])
          _msgCache.set(chatId, merged)
          return merged
        })
        setHasMore(data.has_more ?? false)
      } else {
        setHasMore(false)
      }
    } catch {
      // ignore
    } finally {
      setLoadingEarlier(false)
    }
  }, [chatId, loadingEarlier, hasMore, messages])

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
          // Заменяем opt- на реальное + выкидываем возможные дубли того же
          // реального id (полл мог успеть подхватить его до замены).
          const merged = dedupeAndSort(prev.map((m) => (m.id === id ? real : m)))
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

  const appendServerMessage = useCallback((serverMsg: any) => {
    if (!chatId || !serverMsg?.id) return
    const mapped: ChatMessage = {
      id: String(serverMsg.id),
      chatId,
      senderId: "me",
      text: serverMsg.text ?? "",
      ts: serverMsg.created_at ? parseIsoTs(serverMsg.created_at) : Date.now(),
      status: "sent",
      isVoice: Boolean(serverMsg.is_voice ?? serverMsg.isVoice ?? false),
      voiceDuration: Number(serverMsg.voice_duration ?? serverMsg.voiceDuration ?? 0) || 0,
      voiceMime: String(serverMsg.voice_mime ?? serverMsg.voiceMime ?? "audio/webm"),
    }
    setMessages((prev) => {
      if (prev.some((m) => m.id === mapped.id)) return prev
      // Войс может прийти с серверным ts старше хвоста (задержка загрузки) —
      // сортируем, чтобы не лепился вниз как «новый».
      const merged = dedupeAndSort([...prev, mapped])
      _msgCache.set(chatId, merged)
      return merged
    })
  }, [chatId])

  // Удаление своих сообщений по одному/несколько (оптимистично).
  const deleteMessages = useCallback(
    async (ids: string[]) => {
      if (!chatId || !ids.length) return
      const numeric = ids.filter((id) => !id.startsWith("opt-")).map((id) => parseInt(id, 10)).filter((n) => !isNaN(n))
      if (!numeric.length) return
      const snapshot = messages
      setMessages((prev) => {
        const merged = prev.filter((m) => !numeric.includes(parseInt(m.id, 10)))
        _msgCache.set(chatId, merged)
        return merged
      })
      try {
        await api.post(`/api/chat/${chatId}/messages/delete`, { ids: numeric })
      } catch {
        // Откат: перечитываем страницу заново
        try {
          const data: any = await api.get("/api/chat/" + chatId)
          const serverMsgs = (data.messages ?? []).map(mapMsg)
          setMessages(serverMsgs)
          _msgCache.set(chatId, serverMsgs)
        } catch {}
      }
    },
    [chatId, messages],
  )

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

  return { messages, status, sendMessage, appendServerMessage, deleteMessages, typing, clearChat, blockUser, unblockUser, muteChat, unmuteChat, loadEarlier, loadingEarlier, hasMore }
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
  isVoice?: boolean
  voiceDuration?: number
  voiceMime?: string
}

export type Cosmetics = {
  nick_color: string
  frame_color: string
  card_bg: string
  avatar_art: string
}

const EMPTY_COS: Cosmetics = { nick_color: "", frame_color: "", card_bg: "", avatar_art: "" }

/** Кэш косметики по user_id (строкой). Арт уже даунскейлен клиентом до ~128px. */
const _cosCache = new Map<string, Cosmetics>()

export function getCachedCosmetics(id: string | number): Cosmetics | undefined {
  return _cosCache.get(String(id))
}

export function setCachedCosmetics(id: string | number, c: Cosmetics): void {
  _cosCache.set(String(id), c)
}

export function clearCosmeticsCache(): void {
  _cosCache.clear()
}

/** Батч-подгрузка косметики видимых авторов с кэшем. Возвращает стабильный объект. */
export function useCosmeticsMap(ids: (string | number)[]): Record<string, Cosmetics> {
  const [version, setVersion] = useState(0)
  const key = useMemo(() => [...new Set(ids.map(String))].sort().join(","), [ids.join(",")])
  useEffect(() => {
    if (!key) return
    const missing = key
      .split(",")
      .filter((id) => id && id !== "me" && id !== "0" && !_cosCache.has(id))
    if (!missing.length) return
    let cancelled = false
    api
      .post("/api/cosmetics/batch", { user_ids: missing })
      .then((data: any) => {
        if (cancelled) return
        const map = data?.cosmetics ?? {}
        let changed = false
        for (const [k, v] of Object.entries(map)) {
          _cosCache.set(k, { ...EMPTY_COS, ...((v ?? {}) as Partial<Cosmetics>) })
          changed = true
        }
        if (changed) setVersion((x) => x + 1)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [key])
  return useMemo(() => {
    const rec: Record<string, Cosmetics> = {}
    if (key) {
      for (const id of key.split(",")) {
        const c = _cosCache.get(id)
        if (c) rec[id] = c
      }
    }
    return rec
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version])
}

const _globalCache: GlobalMessage[] = []
let _globalLoaded = false

/** Тёплый кэш: предзагружает глобальный чат при монтировании таба, чтобы он открывался мгновенно. */
export function preloadGlobalChat(): void {
  if (_globalLoaded) return
  _globalLoaded = true
  api.get("/api/global").catch(() => {
    _globalLoaded = false
  }).then((data: any) => {
    if (!data) return
    const list: GlobalMessage[] = (data.messages ?? []).map(mapGlobalMsg)
    _globalCache.length = 0
    _globalCache.push(...list)
  })
}

function mapGlobalMsg(m: any): GlobalMessage {
  const role = m.role ?? ""
  return {
    id: String(m.id ?? ""),
    userId: m.user_id === "me" ? "me" : String(m.user_id ?? ""),
    text: m.text ?? "",
    ts: m.created_at ? parseIsoTs(m.created_at) : Date.now(),
    // Персона Стража (role ai): пустой ник не затираем — имя подставит лента по локали.
    nick: m.nick || (role === "ai" ? "" : m.user_id === "me" ? "You" : "Player"),
    avatar: m.avatar ?? null,
    role,
    deco: m.deco ?? "",
    kind: m.kind === "system" ? "system" : "user",
    isVoice: Boolean(m.is_voice),
    voiceDuration: Number(m.voice_duration ?? 0) || 0,
    voiceMime: String(m.voice_mime ?? "audio/webm"),
  }
}

export function useGlobalChat() {
  const [messages, setMessages] = useState<GlobalMessage[]>(_globalCache)
  const [loaded, setLoaded] = useState(_globalCache.length > 0)
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
        const list: GlobalMessage[] = dedupeAndSort((data.messages ?? []).map(mapGlobalMsg))
        setMessages((prev) => {
          // Слияние вместо замены: медленный GET, ушедший до POST, иначе
          // стирал бы только что отправленное (моргание «появилось-пропало»).
          // Свои свежие (<15с) без серверного эха бережём до следующего полла,
          // остальное — строго с сервера (удалённое модерацией не воскресает).
          const ids = new Set(list.map((m) => m.id))
          const nowTs = Date.now()
          const kept = prev.filter((m) => !ids.has(m.id) && nowTs - m.ts < 15_000)
          const merged = dedupeAndSort([...list, ...kept])
          _globalCache.length = 0
          _globalCache.push(...merged)
          return merged
        })
        setLoaded(true)
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

  const sendGlobal = useCallback(async (text: string): Promise<{ ok: boolean; muteUntil?: string; muteReason?: string }> => {
    if (!text.trim() || sending) return { ok: false }
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
        // Полл мог уже подхватить сообщение — без проверки будет дубль с тем же key.
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : dedupeAndSort([...prev, msg])))
        if (!_globalCache.some((m) => m.id === msg.id)) _globalCache.push(msg)
        return { ok: true }
      }
    } catch (e: any) {
      const data = e?.data ?? {}
      if (String(e?.message ?? "") === "muted") {
        return { ok: false, muteUntil: String(data.mute_until ?? ""), muteReason: String(data.mute_reason ?? "") }
      }
      return { ok: false }
    } finally {
      setSending(false)
    }
    return { ok: false }
  }, [sending, meRole])

  const sendGlobalVoice = useCallback(async (blob: Blob, duration: number, mime: string): Promise<boolean> => {
    setSending(true)
    try {
      const fd = new FormData()
      fd.append("audio", blob, "voice.webm")
      const res: any = await api.postForm("/api/global/voice", fd, { "X-Duration": String(duration) })
      if (res?.message?.id != null) {
        const msg: GlobalMessage = {
          id: String(res.message.id),
          userId: "me",
          text: "",
          ts: res.message.created_at ? parseIsoTs(res.message.created_at) : Date.now(),
          nick: "You",
          avatar: "",
          role: meRole,
          isVoice: true,
          voiceDuration: res.message.voice_duration ?? duration,
          voiceMime: res.message.voice_mime ?? mime,
        }
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : dedupeAndSort([...prev, msg])))
        if (!_globalCache.some((m) => m.id === msg.id)) _globalCache.push(msg)
        return true
      }
    } catch {}
    finally { setSending(false) }
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

  return { messages, loaded, meRole, meBanned, sendGlobal, sendGlobalVoice, sending, deleteMessage, banUser, unbanUser }
}

export function openChatWithPlayer(myId: number | string, otherId: number | string): string {
  return chatIdForPair(myId, otherId)
}

export function getChatPlayer(chatId: string) {
  return _chats.find((c) => c.id === chatId)?.player
}
