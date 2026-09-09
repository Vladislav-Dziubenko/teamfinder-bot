"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Users, Trophy, Swords, Store, Search, Plus, LogOut, Settings as SettingsIcon, Ticket, Crown, MessageCircle, X, Check, Loader2, ChevronLeft } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { clansApi, type Clan, type ClanQuest, type ShopItem } from "@/lib/clans"
import { cn } from "@/lib/utils"
import { ChatConversation } from "./chat-tab"
import { ArtCanvas } from "./cosmetics-editor"

function downscalePhoto(file: File, maxSide = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      try {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const cv = document.createElement("canvas")
        cv.width = w
        cv.height = h
        cv.getContext("2d")?.drawImage(img, 0, 0, w, h)
        resolve(cv.toDataURL("image/jpeg", 0.85))
      } catch (e) {
        reject(e)
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("bad image"))
    }
    img.src = url
  })
}

const EMBLEMS = ["🛡️", "⚔️", "🔥", "❄️", "🐺", "🦁", "🐉", "⚡", "🌪️", "👑", "💎", "🏆"]
const LEVEL_STEPS = [0, 1000, 3000, 8000, 20000, 50000]

type View = "overview" | "members" | "quests" | "rating" | "shop" | "browse" | "create" | "chat" | "history"

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-2 overflow-hidden rounded-full bg-secondary">
      <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all" style={{ width: `${pct}%` }} />
    </div>
  )
}

function levelProgress(lifetime: number): { level: number; cur: number; next: number | null } {
  let level = 1
  for (let i = 0; i < LEVEL_STEPS.length; i++) {
    if (lifetime >= LEVEL_STEPS[i]) level = i + 1
  }
  const cur = LEVEL_STEPS[level - 1] ?? 0
  const next = LEVEL_STEPS[level] ?? null
  return { level, cur, next }
}

export function ClanTab({ onToast }: { onToast: (m: string) => void }) {
  const { lang } = useI18n()
  const ru = lang === "ru"
  const [clan, setClan] = useState<Clan | null | undefined>(undefined)
  const [view, setView] = useState<View>("overview")
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      const res = await clansApi.my()
      setClan(res.clan ?? null)
      if (!res.clan) setView((v) => (v === "create" || v === "browse" ? v : "browse"))
    } catch {
      setClan(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!clan) {
    return <ClanBrowse onToast={onToast} onJoined={reload} initialView={view === "create" ? "create" : "browse"} />
  }

  const tabs: { id: View; label: string; icon: typeof Users }[] = [
    { id: "overview", label: ru ? "Клан" : "Clan", icon: Users },
    { id: "members", label: ru ? "Состав" : "Members", icon: Crown },
    { id: "quests", label: ru ? "Квесты" : "Quests", icon: Swords },
    { id: "rating", label: ru ? "Рейтинг" : "Rating", icon: Trophy },
    { id: "shop", label: ru ? "Магазин" : "Shop", icon: Store },
  ]

  return (
    <div className="space-y-4 px-4 py-5">
      {view === "chat" ? (
        <div className="fixed inset-x-0 top-0 bottom-[60px] z-50 mx-auto max-w-md">
          <ChatConversation
            chatId={`clan-${clan.id}`}
            player={{ id: `clan-${clan.id}`, nick: clan.name, avatar: clan.avatar || "", online: true }}
            role=""
            clanMode
            clanEmblem={clan.emblem}
            onBack={() => setView("overview")}
          />
        </div>
      ) : (
        <>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {tabs.map((tb) => (
              <button
                key={tb.id}
                type="button"
                onClick={() => setView(tb.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-colors active:scale-95",
                  view === tb.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
                )}
              >
                <tb.icon className="size-3.5" />
                {tb.label}
              </button>
            ))}
          </div>
          {view === "overview" && <ClanOverview clan={clan} onToast={onToast} onReload={reload} onChat={() => setView("chat")} ru={ru} />}
          {view === "members" && <ClanMembers clan={clan} onToast={onToast} onReload={reload} ru={ru} />}
          {view === "quests" && <ClanQuests clan={clan} onToast={onToast} ru={ru} />}
          {view === "rating" && <ClanRating ru={ru} />}
          {view === "shop" && <ClanShop clan={clan} onToast={onToast} ru={ru} />}
        </>
      )}
    </div>
  )
}

function ClanAvatarEditor({ clan, onToast, onSaved, ru }: { clan: Clan; onToast: (m: string) => void; onSaved: () => void; ru: boolean }) {
  const [art, setArt] = useState(clan.avatar || "")
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<"draw" | "photo">("draw")
  const fileRef = useRef<HTMLInputElement>(null)

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      setArt(await downscalePhoto(f))
    } catch {
      onToast(ru ? "Не читается картинка" : "Bad image")
    } finally {
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  async function save(): Promise<void> {
    setSaving(true)
    try {
      await clansApi.settings(clan.id, { avatar: art })
      onToast(ru ? "Аватарка клана обновлена" : "Clan avatar updated")
      onSaved()
    } catch (e: any) {
      onToast(e?.message || (ru ? "Не вышло" : "Failed"))
    } finally {
      setSaving(false)
    }
  }

  const dirty = art !== (clan.avatar || "")
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="mb-2 text-xs font-semibold text-muted-foreground">
        {ru ? "Аватарка клана (только лидер)" : "Clan avatar (leader only)"}
      </p>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setTab("draw")}
          className={cn("rounded-xl py-2 text-xs font-bold active:scale-[0.98]", tab === "draw" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}
        >
          ✏️ {ru ? "Нарисовать" : "Draw"}
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("photo")
            fileRef.current?.click()
          }}
          className={cn("rounded-xl py-2 text-xs font-bold active:scale-[0.98]", tab === "photo" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}
        >
          📷 {ru ? "Загрузить фото" : "Upload photo"}
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} className="hidden" />
      {tab === "draw" ? (
        <ArtCanvas initial={art} onArt={setArt} />
      ) : (
        <div className="flex items-center gap-3">
          <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-secondary text-2xl">
            {art ? <img src={art} alt="" className="size-full object-cover" /> : (clan.emblem || "🛡️")}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-xl bg-secondary px-3 py-2 text-xs font-bold active:scale-95"
            >
              {ru ? "Выбрать файл" : "Choose file"}
            </button>
            {art && (
              <button
                type="button"
                onClick={() => setArt("")}
                className="rounded-xl bg-secondary px-3 py-2 text-xs font-bold text-muted-foreground active:scale-95"
              >
                {ru ? "Убрать" : "Remove"}
              </button>
            )}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={save}
        disabled={saving || !dirty}
        className="mt-3 w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground active:scale-[0.98] disabled:opacity-40"
      >
        {saving ? "…" : ru ? "Сохранить аватарку" : "Save avatar"}
      </button>
    </div>
  )
}

function ClanOverview({ clan, onToast, onReload, onChat, ru }: { clan: Clan; onToast: (m: string) => void; onReload: () => void; onChat: () => void; ru: boolean }) {
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const lp = levelProgress(clan.lifetime_points || 0)
  const isLeader = clan.my_role === "leader"
  const isOfficer = isLeader || clan.my_role === "officer"

  async function doLeave(): Promise<void> {
    if (!confirmLeave) {
      setConfirmLeave(true)
      return
    }
    setBusy(true)
    try {
      const res = await clansApi.leave(clan.id)
      if ((res as any)?.error) throw new Error((res as any).error)
      onToast(res.disbanded ? (ru ? "Клан распущен" : "Clan disbanded") : ru ? "Ты вышел из клана" : "Left the clan")
      onReload()
    } catch (e: any) {
      onToast(e?.message || (ru ? "Не вышло" : "Failed"))
    } finally {
      setBusy(false)
      setConfirmLeave(false)
    }
  }

  async function makeInvite(): Promise<void> {
    setBusy(true)
    try {
      const res = await clansApi.invite(clan.id)
      setInviteCode(res.code)
      try {
        await navigator.clipboard?.writeText(res.code)
      } catch {}
    } catch (e: any) {
      onToast(e?.message || (ru ? "Не вышло" : "Failed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-border bg-card p-5 text-center">
        {clan.avatar ? (
          <img src={clan.avatar} alt="" className="mx-auto size-20 rounded-3xl object-cover" />
        ) : (
          <p className="text-5xl leading-none">{clan.emblem || "🛡️"}</p>
        )}
        <h1 className="mt-2 font-display text-2xl font-bold">
          {clan.name} <span className="text-sm text-muted-foreground">[{clan.tag}]</span>
        </h1>
        {!!clan.description && <p className="mt-1 text-sm text-muted-foreground">{clan.description}</p>}
        <div className="mt-2 flex items-center justify-center gap-2 text-xs">
          <span className="rounded-full bg-primary/15 px-2.5 py-1 font-bold text-primary">
            {ru ? `Уровень ${lp.level}` : `Level ${lp.level}`}
          </span>
          <span className="rounded-full bg-secondary px-2.5 py-1 font-semibold text-muted-foreground">
            {clan.member_count}/{clan.max_members} · {clan.my_role}
          </span>
          {!clan.is_public && (
            <span className="rounded-full bg-secondary px-2.5 py-1 font-semibold text-muted-foreground">
              {ru ? "Приватный" : "Private"}
            </span>
          )}
        </div>
        <div className="mt-3">
          <Bar value={(clan.lifetime_points || 0) - lp.cur} max={lp.next != null ? lp.next - lp.cur : 1} />
          <p className="mt-1 text-[11px] text-muted-foreground">
            {clan.lifetime_points || 0} {ru ? "очков за всё время" : "lifetime points"}
            {lp.next != null ? ` · ${ru ? "до" : "to"} ${lp.level + 1}: ${lp.next}` : ""}
          </p>
        </div>
        <div className="mt-2 rounded-2xl bg-secondary/60 px-3 py-2 text-sm font-semibold">
          🏦 {ru ? "Банк" : "Bank"}: <span className="text-primary">{clan.bank_points || 0}</span>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onChat}
          className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground active:scale-[0.98]"
        >
          💬 {ru ? "Чат клана" : "Clan chat"}
        </button>
        {isOfficer && (
          <button
            type="button"
            onClick={makeInvite}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-2xl bg-secondary py-3 text-sm font-bold active:scale-[0.98] disabled:opacity-50"
          >
            <Ticket className="size-4" /> {ru ? "Инвайт-код" : "Invite code"}
          </button>
        )}
      </div>
      {inviteCode && (
        <button
          type="button"
          onClick={() => {
            try {
              navigator.clipboard?.writeText(inviteCode)
            } catch {}
            onToast(ru ? "Код скопирован" : "Code copied")
          }}
          className="w-full rounded-2xl border border-dashed border-primary/50 bg-primary/10 px-4 py-3 text-center font-mono text-lg font-black tracking-widest text-primary active:scale-[0.99]"
        >
          {inviteCode}
        </button>
      )}
      {isLeader && <ClanAvatarEditor clan={clan} onToast={onToast} onSaved={onReload} ru={ru} />}
      <button
        type="button"
        onClick={doLeave}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-destructive/10 py-3 text-sm font-bold text-destructive active:scale-[0.98] disabled:opacity-50"
      >
        <LogOut className="size-4" />
        {confirmLeave ? (ru ? "Точно выйти?" : "Really leave?") : isLeader ? (ru ? "Выйти (лидерство перейдёт)" : "Leave (leadership passes)") : ru ? "Выйти из клана" : "Leave clan"}
      </button>
    </div>
  )
}

function ClanMembers({ clan, onToast, onReload, ru }: { clan: Clan; onToast: (m: string) => void; onReload: () => void; ru: boolean }) {
  const [members, setMembers] = useState(clan.members ?? [])
  const [busyId, setBusyId] = useState<number | null>(null)
  const isLeader = clan.my_role === "leader"
  const canKick = isLeader || clan.my_role === "officer"

  useEffect(() => {
    let cancelled = false
    clansApi
      .detail(clan.id)
      .then((d) => {
        if (!cancelled && d.clan?.members) setMembers(d.clan.members)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [clan.id])

  async function act(fn: () => Promise<unknown>, err: string): Promise<void> {
    try {
      await fn()
      onReload()
    } catch (e: any) {
      onToast(e?.message || err)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="space-y-2">
      {members.map((m) => (
        <div key={m.user_id} className="flex items-center gap-2.5 rounded-2xl border border-border bg-card px-3 py-2.5">
          <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary font-display text-base font-bold">
            {(m as any).avatar ? <img src={(m as any).avatar} alt="" className="size-full object-cover" /> : String(m.nick || "?").charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">
              {m.nick || `User${m.user_id}`}{" "}
              <span className="ml-1 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">{m.role}</span>
            </p>
            <p className="text-[11px] text-muted-foreground">
              {ru ? "Сезон" : "Season"}: {m.contribution_season} · {ru ? "всего" : "total"}: {m.contribution_total}
            </p>
          </div>
          {isLeader && m.role !== "leader" && (
            <button
              type="button"
              disabled={busyId === m.user_id}
              onClick={() => {
                setBusyId(m.user_id)
                void act(() => clansApi.setRole(clan.id, m.user_id, m.role === "officer" ? "member" : "officer"), ru ? "Не вышло" : "Failed")
              }}
              className="rounded-lg bg-secondary px-2 py-1.5 text-[11px] font-bold text-muted-foreground active:scale-95 disabled:opacity-40"
            >
              {m.role === "officer" ? (ru ? "Разжаловать" : "Demote") : <Crown className="size-3.5" />}
            </button>
          )}
          {canKick && m.role !== "leader" && (isLeader || m.role === "member") && (
            <button
              type="button"
              disabled={busyId === m.user_id}
              onClick={() => {
                setBusyId(m.user_id)
                void act(() => clansApi.kick(clan.id, m.user_id), ru ? "Не вышло" : "Failed")
              }}
              className="rounded-lg bg-destructive/10 px-2 py-1.5 text-[11px] font-bold text-destructive active:scale-95 disabled:opacity-40"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      ))}
    </section>
  )
}

function questLabel(t: string, ru: boolean): string {
  if (t === "cases") return ru ? "Открытия кейсов" : "Case opens"
  if (t === "quests") return ru ? "Квесты" : "Quests"
  return t
}

function ClanQuests({ clan, onToast, ru }: { clan: Clan; onToast: (m: string) => void; ru: boolean }) {
  const [quests, setQuests] = useState<ClanQuest[]>([])
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState<number | null>(null)
  const canClaim = clan.my_role === "leader" || clan.my_role === "officer"

  const load = async () => {
    try {
      const res = await clansApi.quests(clan.id)
      setQuests(res.quests ?? [])
    } catch {
      setQuests([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clan.id])

  async function claim(q: ClanQuest): Promise<void> {
    setClaiming(q.id)
    try {
      const res = await clansApi.claimQuest(clan.id, q.id)
      onToast((ru ? "Бонус в банк: +" : "Bank bonus: +") + (res.bank_bonus ?? 0))
      await load()
    } catch (e: any) {
      onToast(e?.message || (ru ? "Не вышло" : "Failed"))
    } finally {
      setClaiming(null)
    }
  }

  if (loading) return <p className="py-8 text-center text-sm text-muted-foreground">…</p>

  return (
    <section className="space-y-2.5">
      {quests.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{ru ? "Нет активных квестов" : "No active quests"}</p>}
      {quests.map((q) => {
        const done = q.progress >= q.target_value
        return (
          <div key={q.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold">
                {q.kind === "daily" ? (ru ? "📅 Дневной" : "📅 Daily") : (ru ? "📆 Недельный" : "📆 Weekly")}: {questLabel(q.target_type, ru)}
              </p>
              {q.claimed ? (
                <span className="flex items-center gap-1 text-xs font-bold text-emerald-400">
                  <Check className="size-3.5" /> {ru ? "Забрано" : "Claimed"}
                </span>
              ) : null}
            </div>
            <div className="mt-2">
              <Bar value={q.progress} max={q.target_value} />
              <p className="mt-1 text-[11px] text-muted-foreground">
                {q.progress}/{q.target_value} · {ru ? "до" : "until"} {(q.ends_at || "").slice(0, 10)}
              </p>
            </div>
            {!q.claimed && done && canClaim && (
              <button
                type="button"
                disabled={claiming === q.id}
                onClick={() => claim(q)}
                className="mt-2 w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground active:scale-[0.98] disabled:opacity-50"
              >
                {claiming === q.id ? "…" : ru ? "Забрать бонус в банк" : "Claim bank bonus"}
              </button>
            )}
            {!q.claimed && done && !canClaim && (
              <p className="mt-2 text-[11px] text-muted-foreground">{ru ? "Выполнено! Забрать может офицер." : "Done! An officer can claim."}</p>
            )}
          </div>
        )
      })}
    </section>
  )
}

function BoardRows({ rows, ru }: { rows: any[]; ru: boolean }) {
  if (!rows.length) return <p className="py-8 text-center text-sm text-muted-foreground">{ru ? "Пока пусто — сезон только начался" : "Empty yet — season just started"}</p>
  return (
    <div className="space-y-2">
      {rows.map((r: any) => (
        <div key={r.id} className="flex items-center gap-2.5 rounded-2xl border border-border bg-card px-3 py-2.5">
          <span className="w-7 shrink-0 text-center font-display text-base font-black text-primary">#{r.rank ?? "–"}</span>
          <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-secondary text-lg">
            {r.avatar ? <img src={r.avatar} alt="" className="size-full object-cover" /> : (r.emblem || "🛡️")}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">
              {r.name} <span className="text-[11px] text-muted-foreground">[{r.tag}]</span>
            </p>
            <p className="text-[11px] text-muted-foreground">
              {r.total} {ru ? "очков" : "pts"} · {r.members} {ru ? "уч." : "members"}
              {typeof r.per_member === "number" ? ` · ${r.per_member.toFixed(1)}/${ru ? "уч" : "m"}` : ""}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

function ClanRating({ ru }: { ru: boolean }) {
  const [by, setBy] = useState<"total" | "per_member">("total")
  const [rows, setRows] = useState<any[]>([])
  const [season, setSeason] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([clansApi.leaderboard(by), clansApi.seasonCurrent()])
      .then(([b, s]) => {
        if (cancelled) return
        setRows(b.board ?? [])
        setSeason(s.season ?? null)
      })
      .catch(() => {
        if (!cancelled) setRows([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [by])

  return (
    <section className="space-y-3">
      {!!season && (
        <p className="text-center text-xs text-muted-foreground">
          {ru ? `Сезон ${season.year_month} · конец ${season.ends_at} · награды топ-10%` : `Season ${season.year_month} · ends ${season.ends_at} · top-10% rewards`}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setBy("total")}
          className={cn("rounded-xl py-2.5 text-sm font-bold active:scale-[0.98]", by === "total" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}
        >
          {ru ? "🏆 По очкам" : "🏆 By points"}
        </button>
        <button
          type="button"
          onClick={() => setBy("per_member")}
          className={cn("rounded-xl py-2.5 text-sm font-bold active:scale-[0.98]", by === "per_member" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}
        >
          {ru ? "⚡ Эффективность" : "⚡ Efficiency"}
        </button>
      </div>
      {loading ? <p className="py-8 text-center text-sm text-muted-foreground">…</p> : <BoardRows rows={rows} ru={ru} />}
    </section>
  )
}

function ClanShop({ clan, onToast, ru }: { clan: Clan; onToast: (m: string) => void; ru: boolean }) {
  const [items, setItems] = useState<{ id: number; title: string; cost_points: number }[]>([])
  const [bank, setBank] = useState(clan.bank_points || 0)
  const [buying, setBuying] = useState<number | null>(null)
  const isLeader = clan.my_role === "leader"

  const load = async () => {
    try {
      const res = await clansApi.shop(clan.id)
      setItems(res.items ?? [])
      setBank(res.bank_points ?? 0)
    } catch {
      setItems([])
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clan.id])

  async function buy(id: number): Promise<void> {
    setBuying(id)
    try {
      const res = await clansApi.shopBuy(clan.id, id)
      onToast(`✅ ${res.title}`)
      await load()
    } catch (e: any) {
      onToast(e?.message || (ru ? "Не вышло" : "Failed"))
    } finally {
      setBuying(null)
    }
  }

  return (
    <section className="space-y-2.5">
      <div className="rounded-2xl bg-secondary/60 px-4 py-3 text-center text-sm font-bold">
        🏦 {ru ? "Банк" : "Bank"}: <span className="text-primary">{bank}</span>
      </div>
      {!isLeader && (
        <p className="text-center text-[11px] text-muted-foreground">{ru ? "Покупки — только лидеру клана" : "Only the leader can buy"}</p>
      )}
      {items.map((it) => (
        <div key={it.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{it.title}</p>
            <p className="text-xs text-muted-foreground">🏦 {it.cost_points}</p>
          </div>
          <button
            type="button"
            disabled={!isLeader || buying === it.id || bank < it.cost_points}
            onClick={() => buy(it.id)}
            className="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground active:scale-95 disabled:opacity-40"
          >
            {buying === it.id ? "…" : ru ? "Купить" : "Buy"}
          </button>
        </div>
      ))}
    </section>
  )
}

function ClanBrowse({ onToast, onJoined, initialView }: { onToast: (m: string) => void; onJoined: () => void; initialView: "browse" | "create" }) {
  const { lang } = useI18n()
  const bru = lang === "ru"
  const [mode, setMode] = useState<"browse" | "create">(initialView)
  const [q, setQ] = useState("")
  const [list, setList] = useState<Clan[]>([])
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState<number | null>(null)
  const [inviteCode, setInviteCode] = useState("")
  const [name, setName] = useState("")
  const [tag, setTag] = useState("")
  const [emblem, setEmblem] = useState("🛡️")
  const [desc, setDesc] = useState("")
  const [isPublic, setIsPublic] = useState(true)
  const [creating, setCreating] = useState(false)

  const doSearch = async (query: string) => {
    setLoading(true)
    try {
      const res = await clansApi.search(query)
      setList(res.clans ?? [])
    } catch {
      setList([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    doSearch("")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function join(id: number): Promise<void> {
    setJoining(id)
    try {
      await clansApi.join(id, inviteCode.trim() || undefined)
      onToast(bru ? "Добро пожаловать в клан!" : "Welcome to the clan!")
      onJoined()
    } catch (e: any) {
      onToast(e?.message || (bru ? "Не вышло" : "Failed"))
    } finally {
      setJoining(null)
    }
  }

  async function create(): Promise<void> {
    if (name.trim().length < 3 || tag.trim().length < 2) {
      onToast(bru ? "Название от 3 символов, тег 2–5" : "Name 3+, tag 2–5")
      return
    }
    setCreating(true)
    try {
      await clansApi.create({ name: name.trim(), tag: tag.trim(), emblem, description: desc.trim(), is_public: isPublic })
      onToast(bru ? "Клан создан!" : "Clan created!")
      onJoined()
    } catch (e: any) {
      onToast(e?.message || (bru ? "Не вышло" : "Failed"))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-4 px-4 py-5">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode("browse")}
          className={cn("rounded-xl py-2.5 text-sm font-bold active:scale-[0.98]", mode === "browse" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}
        >
          <Search className="mr-1 inline size-4" />
          {bru ? "Найти" : "Find"}
        </button>
        <button
          type="button"
          onClick={() => setMode("create")}
          className={cn("rounded-xl py-2.5 text-sm font-bold active:scale-[0.98]", mode === "create" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}
        >
          <Plus className="mr-1 inline size-4" />
          {bru ? "Создать" : "Create"}
        </button>
      </div>

      {mode === "browse" ? (
        <>
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              void doSearch(e.target.value)
            }}
            placeholder={bru ? "Название или тег…" : "Name or tag…"}
            className="w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
          />
          <input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            placeholder={bru ? "Инвайт-код приватного клана (если есть)" : "Private clan invite code (if any)"}
            className="w-full rounded-2xl border border-input bg-card px-4 py-3 font-mono text-sm tracking-widest outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-muted-foreground/60 focus:border-primary/50"
          />
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">…</p>
          ) : list.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{bru ? "Никого не нашли — создай свой!" : "Nobody found — create your own!"}</p>
          ) : (
            <div className="space-y-2">
              {list.map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
                  <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-secondary text-2xl">
                    {c.avatar ? <img src={c.avatar} alt="" className="size-full object-cover" /> : (c.emblem || "🛡️")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">
                      {c.name} <span className="text-[11px] text-muted-foreground">[{c.tag}]</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      👥 {c.member_count} · ⭐ {c.lifetime_points || 0} · {bru ? "ур." : "lvl"} {c.level || 1}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={joining === c.id}
                    onClick={() => join(c.id)}
                    className="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground active:scale-95 disabled:opacity-50"
                  >
                    {joining === c.id ? "…" : bru ? "Войти" : "Join"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-3 rounded-3xl border border-border bg-card p-5">
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{bru ? "Название" : "Name"}</p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              placeholder={bru ? "Ночные Волки" : "Night Wolves"}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50"
            />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{bru ? "Тег (2–5, A-Z/0-9)" : "Tag (2–5, A-Z/0-9)"}</p>
            <input
              value={tag}
              onChange={(e) => setTag(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))}
              maxLength={5}
              placeholder="WOLF"
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 font-mono text-sm tracking-widest outline-none focus:border-primary/50"
            />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{bru ? "Эмблема" : "Emblem"}</p>
            <div className="flex flex-wrap gap-2">
              {EMBLEMS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmblem(e)}
                  className={cn("grid size-11 place-items-center rounded-2xl border-2 text-2xl active:scale-90", emblem === e ? "border-primary bg-primary/10" : "border-border bg-secondary/50")}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{bru ? "Описание" : "Description"}</p>
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              maxLength={200}
              placeholder={bru ? "Клан для своих…" : "Clan for friends…"}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50"
            />
          </div>
          <button
            type="button"
            onClick={() => setIsPublic((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl bg-secondary/60 px-3 py-2.5 text-sm font-semibold"
          >
            {isPublic ? (bru ? "🌍 Открытый (в поиске)" : "🌍 Public (searchable)") : (bru ? "🔒 Приватный (по инвайту)" : "🔒 Private (invite only)")}
            <span className={cn("relative h-6 w-11 rounded-full transition-colors", isPublic ? "bg-primary" : "bg-muted-foreground/30")}>
              <span className={cn("absolute top-0.5 size-5 rounded-full bg-white transition-all", isPublic ? "left-[22px]" : "left-0.5")} />
            </span>
          </button>
          <button
            type="button"
            onClick={create}
            disabled={creating}
            className="w-full rounded-2xl bg-primary py-3 font-display text-sm font-bold text-primary-foreground active:scale-[0.98] disabled:opacity-50"
          >
            {creating ? "…" : bru ? "Создать клан" : "Create clan"}
          </button>
        </div>
      )}
    </div>
  )
}
