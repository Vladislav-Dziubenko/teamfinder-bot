"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"

const DEBOUNCE_MS = 10_000

export type DiscordStatus = {
  linked: boolean
  discord_id?: string | null
  username?: string | null
  global_name?: string | null
  avatar_url?: string | null
  linked_at?: string | null
}

type AuthResp = { url: string }

export function useDiscord() {
  const [status, setStatus] = useState<DiscordStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastFetchRef = useRef(0)
  const unauthRef = useRef(false)

  const refresh = useCallback(async () => {
    if (unauthRef.current) return
    const now = Date.now()
    if (now - lastFetchRef.current < DEBOUNCE_MS) return
    lastFetchRef.current = now
    try {
      setError(null)
      const data = await api.get<DiscordStatus>("/api/discord/status")
      setStatus(data)
    } catch (e: any) {
      if (e?.message?.includes("401") || e?.message?.includes("unauthorized")) {
        unauthRef.current = true
      }
      setError(e?.message ?? "Не удалось получить статус Discord")
    } finally {
      setLoading(false)
    }
  }, [])

  const connect = useCallback(async () => {
    try {
      setBusy(true)
      setError(null)
      const { url } = await api.get<AuthResp>("/api/discord/auth")
      const tg = (window as any)?.Telegram?.WebApp
      if (tg?.openLink) {
        tg.openLink(url, { try_instant_view: false })
      } else {
        window.open(url, "_blank", "noopener,noreferrer")
      }
    } catch (e: any) {
      setError(e?.message ?? "Не удалось открыть Discord")
    } finally {
      setBusy(false)
    }
  }, [])

  const unlink = useCallback(async () => {
    try {
      setBusy(true)
      setError(null)
      await api.post("/api/discord/unlink")
      unauthRef.current = false
      await refresh()
    } catch (e: any) {
      setError(e?.message ?? "Не удалось отвязать Discord")
    } finally {
      setBusy(false)
    }
  }, [refresh])

  useEffect(() => {
    refresh()
    const onVis = () => {
      if (document.visibilityState === "visible") refresh()
    }
    const onFocus = () => refresh()
    document.addEventListener("visibilitychange", onVis)
    window.addEventListener("focus", onFocus)
    return () => {
      document.removeEventListener("visibilitychange", onVis)
      window.removeEventListener("focus", onFocus)
    }
  }, [refresh])

  return { status, loading, busy, error, connect, unlink, refresh }
}