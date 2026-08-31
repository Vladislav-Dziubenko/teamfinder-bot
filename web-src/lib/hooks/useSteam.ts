"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"

const DEBOUNCE_MS = 10_000

export type SteamStatus = {
  linked: boolean
  steamid64?: string | null
  username?: string | null
  avatar?: string | null
  real_name?: string | null
  cs2_minutes?: number
  cs2_kills?: number
  linked_at?: string | null
  verified_at?: string | null
  welcome_claimed?: boolean
}

type AuthResp = { url: string }

export function useSteam() {
  const [status, setStatus] = useState<SteamStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastFetchRef = useRef(0)
  const unauthRef = useRef(false)

  const refresh = useCallback(async (force = false) => {
    const now = Date.now()
    if (!force && now - lastFetchRef.current < DEBOUNCE_MS) return
    lastFetchRef.current = now
    try {
      setError(null)
      const data = await api.get<SteamStatus>("/api/steam/status")
      setStatus(data)
      unauthRef.current = false
    } catch (e: any) {
      setError(e?.message ?? "Не удалось получить статус Steam")
    } finally {
      setLoading(false)
    }
  }, [])

  const connect = useCallback(async () => {
    try {
      setBusy(true)
      setError(null)
      const { url } = await api.get<AuthResp>("/api/steam/auth")
      window.open(url, "_blank", "noopener,noreferrer")
    } catch (e: any) {
      setError(e?.message ?? "Не удалось открыть Steam")
    } finally {
      setBusy(false)
    }
  }, [])

  const unlink = useCallback(async () => {
    try {
      setBusy(true)
      setError(null)
      await api.post("/api/steam/unlink")
      unauthRef.current = false
      await refresh()
    } catch (e: any) {
      setError(e?.message ?? "Не удалось отвязать Steam")
    } finally {
      setBusy(false)
    }
  }, [refresh])

  useEffect(() => {
    refresh(true)
    try {
      const sp = new URLSearchParams(window.location.search)
      if (sp.has("steam")) {
        lastFetchRef.current = 0
        refresh(true)
        sp.delete("steam"); sp.delete("reason")
        const qs = sp.toString()
        window.history.replaceState({}, "", window.location.pathname + (qs ? "?" + qs : ""))
      }
    } catch {}
    const onVis = () => {
      if (document.visibilityState === "visible") { lastFetchRef.current = 0; refresh(true) }
    }
    const onFocus = () => { lastFetchRef.current = 0; refresh(true) }
    document.addEventListener("visibilitychange", onVis)
    window.addEventListener("focus", onFocus)
    return () => {
      document.removeEventListener("visibilitychange", onVis)
      window.removeEventListener("focus", onFocus)
    }
  }, [refresh])

  return { status, loading, busy, error, connect, unlink, refresh }
}