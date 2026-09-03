"use client"

import { useEffect, useState } from "react"
import { Timer, Gamepad2, Users, Loader2, LogOut, Plus, Lock, UserMinus } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { useNexus } from "@/lib/store"
import { games } from "@/lib/data"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

type SessionPlayer = {
  user_id: number
  nick: string
  avatar: string | null
}

type GameSession = {
  id: number
  creator_id: number
  game: string
  title: string
  status: string
  created_at: string
  expires_at: string
  players_count: number
  players: SessionPlayer[]
  max_players?: number
  is_private?: boolean
}

const DURATIONS = [15, 30, 60, 120]
const MAX_PLAYERS_OPTIONS = [2, 3, 4, 5, 6, 8, 10, 12, 16, 20]

export function SessionTab({ onToast }: { onToast: (m: string) => void }) {
  const { t } = useI18n()
  const { userId, refresh } = useNexus()
  const [sessions, setSessions] = useState<GameSession[]>([])
  const [loading, setLoading] = useState(false)
  const [game, setGame] = useState("cs2")
  const [minutes, setMinutes] = useState(30)
  const [maxPlayers, setMaxPlayers] = useState(6)
  const [password, setPassword] = useState("")
  const [creating, setCreating] = useState(false)
  const [joiningId, setJoiningId] = useState<number | null>(null)
  const [joiningPassword, setJoiningPassword] = useState("")
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  async function load() {
    setLoading(true)
    try {
      const data: any = await api.get("/api/sessions")
      setSessions(data.sessions ?? [])
    } catch {
      setSessions([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 10000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function create() {
    if (creating) return
    setCreating(true)
    try {
      await api.post("/api/sessions", { game, minutes, max_players: maxPlayers, password: password || undefined })
      onToast(t("sessions.created"))
      await load()
      await refresh()
      setPassword("")
    } catch {
      onToast(t("sessions.create_failed"))
    } finally {
      setCreating(false)
    }
  }

  async function join(s: GameSession) {
    if (joiningId) return
    // Check if session is private and needs password
    if (s.is_private) {
      const pwd = prompt(t("sessions.password_prompt"))
      if (!pwd) return
      setJoiningId(s.id)
      try {
        await api.post(`/api/sessions/${s.id}/join`, { password: pwd })
        onToast(t("sessions.joined"))
        await load()
      } catch {
        onToast(t("sessions.join_failed"))
      } finally {
        setJoiningId(null)
      }
      return
    }
    setJoiningId(s.id)
    try {
      await api.post(`/api/sessions/${s.id}/join`)
      onToast(t("sessions.joined"))
      await load()
    } catch {
      onToast(t("sessions.join_failed"))
    } finally {
      setJoiningId(null)
    }
  }

  async function leave(s: GameSession) {
    setJoiningId(s.id)
    try {
      await api.post(`/api/sessions/${s.id}/leave`)
      onToast(s.creator_id === userId ? t("sessions.cancelled") : t("sessions.left"))
      await load()
    } catch {
      onToast(t("sessions.join_failed"))
    } finally {
      setJoiningId(null)
    }
  }

  function timeLeft(s: GameSession): string {
    const ms = new Date(s.expires_at).getTime() - Date.now()
    if (ms <= 0) return "00:00"
    const total = Math.floor(ms / 1000)
    const m = Math.floor(total / 60)
    const sec = total % 60
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
  }

  const mySession = sessions.find((s) => s.players.some((p) => p.user_id === userId))
  const others = sessions.filter((s) => !s.players.some((p) => p.user_id === userId))

  return (
    <div className="space-y-4 px-4 py-5">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold">
          <Timer className="size-6 text-primary" /> {t("sessions.title")}
        </h1>
        <p className="text-sm text-muted-foreground text-pretty">{t("sessions.subtitle")}</p>
      </div>

      {/* Создание сессии */}
      <section className="rounded-3xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Gamepad2 className="size-4 text-primary" /> {t("sessions.create_title")}
        </h2>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {games.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setGame(g.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all active:scale-95",
                game === g.id ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-secondary/50 text-muted-foreground",
              )}
            >
              <span>{g.emoji}</span>
              <span>{g.short}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-1.5">
          {DURATIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setMinutes(d)}
              className={cn(
                "flex-1 rounded-xl border px-2 py-2 text-xs font-bold transition-colors active:scale-95",
                minutes === d ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-secondary/50 text-muted-foreground",
              )}
            >
              {d} {t("sessions.minutes")}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-1.5">
          {MAX_PLAYERS_OPTIONS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setMaxPlayers(p)}
              className={cn(
                "flex-1 rounded-xl border px-2 py-2 text-xs font-bold transition-colors active:scale-95",
                maxPlayers === p ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-secondary/50 text-muted-foreground",
              )}
            >
              {p} {t("sessions.max_players")}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <label className="block text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">
            {t("sessions.password_label")}
          </label>
          <div className="flex gap-1.5">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("sessions.password_placeholder")}
              className="flex-1 rounded-xl border border-input bg-background px-4 py-2 text-sm font-medium outline-none placeholder:text-muted-foreground/40"
              maxLength={20}
            />
            <label className="flex items-center gap-1.5 rounded-xl border border-border bg-secondary/60 px-3 py-2 text-xs font-semibold text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={!!password}
                onChange={(e) => { if (!e.target.checked) setPassword("") }}
                className="size-4 accent-primary"
              />
              {t("sessions.private_session")}
            </label>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">{t("sessions.password_hint")}</p>
        </div>
        <button
          type="button"
          disabled={creating}
          onClick={create}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground active:scale-[0.98] disabled:opacity-50"
        >
          {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          {t("sessions.create_btn")}
        </button>
      </section>

      {loading && <Loader2 className="mx-auto mt-4 size-6 animate-spin text-muted-foreground" />}

      {!loading && sessions.length === 0 && (
        <div className="rounded-3xl border border-dashed border-border py-12 text-center">
          <Timer className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">{t("sessions.empty")}</p>
        </div>
      )}

      {mySession && <SessionCard s={mySession} mine userId={userId} onJoin={join} onLeave={leave} busy={joiningId} timeLeft={timeLeft} t={t} />}

      <div className="space-y-2.5">
        {others.map((s) => (
          <SessionCard key={s.id} s={s} mine={false} userId={userId} onJoin={join} onLeave={leave} busy={joiningId} timeLeft={timeLeft} t={t} />
        ))}
      </div>
    </div>
  )
}

function SessionCard({
  s,
  mine,
  userId,
  onJoin,
  onLeave,
  busy,
  timeLeft,
  t,
}: {
  s: GameSession
  mine: boolean
  userId: number
  onJoin: (s: GameSession) => void
  onLeave: (s: GameSession) => void
  busy: number | null
  timeLeft: (s: GameSession) => string
  t: (k: string, vars?: Record<string, string | number>) => string
}) {
  const gm = games.find((g) => g.id === s.game)
  const creator = s.players.find((p) => p.user_id === s.creator_id)
  const joined = s.players.some((p) => p.user_id === userId)
  return (
    <>
      <div className="flex items-center gap-2.5">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary/60 text-xl">{gm?.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-bold" style={{ color: gm?.color }}>
            {gm?.name ?? s.game}
            {s.is_private && <Lock className="ml-1.5 size-3.5 text-primary/80" title={t("sessions.private_session")} />}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {creator ? creator.nick : "User" + s.creator_id}
            {mine && <span className="ml-1 text-primary">· {t("sessions.you_created")}</span>}
          </p>
        </div>
        <span className={cn("flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 font-display text-sm font-bold tabular-nums", mine ? "bg-primary/15 text-primary" : "bg-secondary/60 text-muted-foreground")}>
          <Timer className="size-3.5" /> {timeLeft(s)}
        </span>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center">
          <div className="flex -space-x-2">
            {s.players.slice(0, (s.max_players || 6)).map((p) => (
              <img
                key={p.user_id}
                src={p.avatar || `/player-${((p.user_id % 4) + 1)}.webp`}
                alt={p.nick}
                title={p.nick}
                className="size-7 rounded-full border-2 border-card object-cover"
              />
            ))}
          </div>
          <span className="ml-2 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
            <Users className="size-3" /> {s.players_count}/{s.max_players || 6}
          </span>
        </div>
        {joined ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => onLeave(s)}
            className="flex items-center gap-1.5 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive transition-transform active:scale-95 disabled:opacity-50"
          >
            {busy === s.id ? <Loader2 className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />}
            {s.creator_id === userId ? t("sessions.cancel_btn") : t("sessions.leave_btn")}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy !== null || s.players_count >= (s.max_players || 6)}
            onClick={() => onJoin(s)}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition-transform active:scale-95 disabled:opacity-50"
          >
            {busy === s.id ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            {s.players_count >= MAX_PLAYERS ? t("sessions.full") : t("sessions.join_btn")}
          </button>
        )}
      </div>
  </> )
}
