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
  welcome_claimed?: boolean
  daily_ready?: boolean
  daily_claims_count?: number
  quest_claimed_at?: string | null
  quest_target?: number
  quest_bonus?: number
  invite_url?: string
  invite_claimed_at?: string | null
  invite_bonus?: number
}

type AuthResp = { url: string }

export function useDiscord() {
  const [status, setStatus] = useState<DiscordStatus | null>(null)
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
      const data = await api.get<DiscordStatus>("/api/discord/status")
      setStatus(data)
      unauthRef.current = false
    } catch (e: any) {
      if (e?.message?.includes("401") || e?.message?.includes("unauthorized")) {
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
      window.open(url, "_blank", "noopener,noreferrer")
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

  const claimDaily = useCallback(async (): Promise<{ ok: boolean; stars?: number }> => {
    try {
      setBusy(true)
      setError(null)
      const data = await api.post<{ claimed: boolean; stars?: number; reason?: string }>("/api/discord/daily")
      if (data?.claimed) {
        lastFetchRef.current = 0
        await refresh(true)
        return { ok: true, stars: data.stars ?? 10 }
      }
      // force refresh even if not claimed to update daily_ready
      lastFetchRef.current = 0
      await refresh(true)
      return { ok: false }
    } catch (e: any) {
      setError(e?.message ?? "Не удалось получить награду")
      return { ok: false }
    } finally {
      setBusy(false)
    }
  }, [refresh])

  const claimQuest = useCallback(async (): Promise<{ ok: boolean; stars?: number }> => {
    try {
      setBusy(true)
      setError(null)
      const data = await api.post<{ ok: boolean; stars?: number }>("/api/discord/quest-claim")
      if (data?.ok) {
        lastFetchRef.current = 0
        await refresh(true)
        return { ok: true, stars: data.stars ?? 0 }
      }
      lastFetchRef.current = 0
      await refresh(true)
      return { ok: false }
    } catch (e: any) {
      setError(e?.message ?? "Не удалось получить награду")
      return { ok: false }
    } finally {
      setBusy(false)
    }
  }, [refresh])

  const syncProfile = useCallback(async (): Promise<boolean> => {
    try {
      setBusy(true)
      setError(null)
      const data = await api.post<{ ok: boolean }>("/api/discord/sync-profile")
      if (data?.ok) {
        lastFetchRef.current = 0
        await refresh(true)
        return true
      }
      return false
    } catch (e: any) {
      setError(e?.message ?? "Не удалось применить профиль")
      return false
    } finally {
      setBusy(false)
    }
  }, [refresh])

  const claimInvite = useCallback(async (): Promise<{ ok: boolean; stars?: number }> => {
    try {
      setBusy(true)
      setError(null)
      const data = await api.post<{ ok: boolean; stars?: number }>("/api/discord/invite-claim")
      if (data?.ok) {
        lastFetchRef.current = 0
        await refresh(true)
        return { ok: true, stars: data.stars ?? 0 }
      }
      lastFetchRef.current = 0
      await refresh(true)
      return { ok: false }
    } catch (e: any) {
      setError(e?.message ?? "Не удалось получить награду")
      return { ok: false }
    } finally {
      setBusy(false)
    }
  }, [refresh])

  useEffect(() => {
    refresh(true)
    // handle ?discord=ok/error from old redirects (fallback)
    try {
      const sp = new URLSearchParams(window.location.search)
      if (sp.has("discord")) {
        lastFetchRef.current = 0
        refresh(true)
        // clean url without reload
        sp.delete("discord"); sp.delete("reason")
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

  return { status, loading, busy, error, connect, unlink, claimDaily, claimQuest, syncProfile, claimInvite, refresh }
}