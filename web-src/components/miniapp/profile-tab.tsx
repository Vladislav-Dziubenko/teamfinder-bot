"use client"

import { useRef, useState } from "react"
import {
  Star,
  Trophy,
  Crosshair,
  Settings,
  Share2,
  Gamepad2,
  ChevronRight,
  Crown,
  Camera,
  Pencil,
  Sparkles,
  Check,
  Lock,
  Coins,
  Award,
} from "lucide-react"
import { currentUser, games, achievements as achData } from "@/lib/data"
import { useNexus } from "@/lib/store"
import type { TabId } from "./bottom-nav"
import { cn } from "@/lib/utils"

// Украшения карточки — доступны при премиуме
const decorations = [
  { id: "orange", label: "Neon", ring: "var(--primary)", bg: "var(--primary)" },
  { id: "gold", label: "Gold", ring: "var(--stars)", bg: "var(--stars)" },
  { id: "cyan", label: "Cyber", ring: "var(--accent)", bg: "var(--accent)" },
  { id: "crimson", label: "Blood", ring: "var(--destructive)", bg: "var(--destructive)" },
]

export function ProfileTab({ onGo }: { onGo: (t: TabId) => void }) {
  const game = games.find((g) => g.id === currentUser.game)
  const { stars, coins, points, premiumActive, addCoins, addPoints } = useNexus()

  const [photo, setPhoto] = useState<string | null>(null)
  const [nick, setNick] = useState(currentUser.nick)
  const [bio, setBio] = useState("Ищу пати на фейсит по вечерам. Дискорд обязателен, без токсиков.")
  const [deco, setDeco] = useState("orange")
  const [editing, setEditing] = useState(false)
  const [claimed, setClaimed] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const active = decorations.find((d) => d.id === deco) ?? decorations[0]

  function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) setPhoto(URL.createObjectURL(f))
  }

  function claim(id: string, pts: number, cns: number) {
    if (claimed.includes(id)) return
    addPoints(pts)
    addCoins(cns)
    setClaimed((c) => [...c, id])
  }

  return (
    <div className="space-y-5 px-4 py-5">
      {/* Premium anketa card */}
      <section
        className="animate-rise relative overflow-hidden rounded-3xl border bg-card p-5"
        style={{ borderColor: premiumActive ? active.ring : "var(--border)" }}
      >
        {premiumActive && (
          <>
            <div
              className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full blur-3xl"
              style={{ background: `color-mix(in oklch, ${active.bg} 25%, transparent)` }}
            />
            <span className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-stars/15 px-2 py-1 text-[10px] font-bold text-stars">
              <Crown className="size-3 fill-stars" /> PREMIUM
            </span>
          </>
        )}

        <div className="relative flex items-center gap-4">
          <div className="relative">
            <button
              type="button"
              onClick={() => premiumActive && fileRef.current?.click()}
              className="relative grid size-20 place-items-center overflow-hidden rounded-3xl font-display text-3xl font-bold text-primary-foreground"
              style={{ background: active.bg, boxShadow: premiumActive ? `0 0 24px -6px ${active.ring}` : "none" }}
            >
              {photo ? (
                <img src={photo || "/placeholder.svg"} alt="" className="size-full object-cover" />
              ) : (
                nick.charAt(0).toUpperCase()
              )}
              {premiumActive && (
                <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-background/70 py-0.5 text-[9px] font-medium text-foreground">
                  <Camera className="size-2.5" /> фото
                </span>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={onPickPhoto} className="hidden" />
            <span className="absolute -bottom-1 -right-1 rounded-lg bg-stars px-1.5 py-0.5 font-display text-xs font-bold text-background">
              {currentUser.level}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            {editing && premiumActive ? (
              <input
                value={nick}
                onChange={(e) => setNick(e.target.value)}
                maxLength={20}
                className="w-full rounded-lg border border-input bg-background px-2 py-1 font-display text-xl font-bold outline-none"
              />
            ) : (
              <h1 className="font-display text-2xl font-bold leading-tight">{nick}</h1>
            )}
            <p className="text-sm text-muted-foreground">{currentUser.rank}</p>
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium">
              <Gamepad2 className="size-3 text-primary" /> {game?.name}
            </span>
          </div>
        </div>

        {/* Editable bio */}
        <div className="mt-4">
          {editing && premiumActive ? (
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={140}
              rows={2}
              className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none"
            />
          ) : (
            <p className="rounded-xl bg-secondary/50 px-3 py-2 text-sm text-muted-foreground text-pretty">{bio}</p>
          )}
        </div>

        {/* Decorations — premium only */}
        {premiumActive && (
          <div className="mt-4">
            <p className="mb-2 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
              <Sparkles className="size-3.5 text-stars" /> Украшение карточки
            </p>
            <div className="flex gap-2">
              {decorations.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDeco(d.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                    deco === d.id ? "border-transparent text-background" : "border-border text-muted-foreground",
                  )}
                  style={deco === d.id ? { background: d.bg } : undefined}
                >
                  <span className="size-2.5 rounded-full" style={{ background: d.bg }} />
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* XP bar */}
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
            <span>Уровень {currentUser.level}</span>
            <span>
              {currentUser.xp}% до {currentUser.level + 1}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full" style={{ width: `${currentUser.xp}%`, background: active.bg }} />
          </div>
        </div>

        {/* Edit / customize controls */}
        <div className="mt-4">
          {premiumActive ? (
            <button
              type="button"
              onClick={() => setEditing((e) => !e)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground active:scale-[0.98]"
            >
              {editing ? (
                <>
                  <Check className="size-4" /> Сохранить анкету
                </>
              ) : (
                <>
                  <Pencil className="size-4" /> Настроить анкету
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onGo("cases")}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-stars/40 bg-stars/10 py-3 text-sm font-semibold text-stars active:scale-[0.98]"
            >
              <Lock className="size-4" /> Кастомизация — за премиум
            </button>
          )}
        </div>
      </section>

      {/* Premium promo (если не активен) */}
      {!premiumActive && (
        <section className="relative overflow-hidden rounded-3xl border border-stars/40 bg-stars/5 p-4">
          <div className="flex items-center gap-3">
            <img src="/premium-reveal.png" alt="" className="size-16 shrink-0 object-contain" />
            <div className="min-w-0">
              <p className="font-display text-base font-bold">Nexus Premium</p>
              <p className="text-xs text-muted-foreground text-pretty">
                Открой золотой кейс за 150 ⭐ — кастом фото, свой текст и украшения анкеты на день.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onGo("cases")}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-stars py-3 font-display text-base font-bold text-background active:scale-[0.98]"
          >
            <Crown className="size-5" /> Получить премиум
          </button>
        </section>
      )}

      {/* Currency stats */}
      <section className="grid grid-cols-3 gap-3">
        <CoinStat img="/nexus-coin.png" value={coins} label="Монеты" />
        <StarStat value={stars} label="Звёзды" />
        <PointStat value={points} label="Баллы" />
      </section>

      {/* Achievements with rewards */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
          <Award className="size-5 text-primary" /> Достижения
        </h2>
        <div className="space-y-3">
          {achData.map((a) => {
            const done = a.progress >= a.minutes
            const isClaimed = claimed.includes(a.id)
            const pct = Math.min(100, Math.round((a.progress / a.minutes) * 100))
            return (
              <div key={a.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {a.game}
                    </span>
                    <p className="mt-1.5 font-display text-sm font-bold leading-tight text-balance">{a.title}</p>
                    <p className="text-[11px] text-muted-foreground text-pretty">{a.desc}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="flex items-center justify-end gap-0.5 text-xs font-bold text-primary">
                      +{a.points} <span className="text-[10px] font-medium text-muted-foreground">балл</span>
                    </p>
                    <p className="flex items-center justify-end gap-1 text-xs font-bold text-foreground">
                      <img src="/nexus-coin.png" alt="" className="size-3.5 rounded-full" /> +{a.coins}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={cn("h-full rounded-full", done ? "bg-accent" : "bg-primary")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    {a.progress}/{a.minutes} мин
                  </span>
                </div>

                <button
                  type="button"
                  disabled={!done || isClaimed}
                  onClick={() => claim(a.id, a.points, a.coins)}
                  className={cn(
                    "mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-all active:scale-95 disabled:opacity-50",
                    isClaimed
                      ? "bg-secondary text-muted-foreground"
                      : done
                        ? "bg-accent text-accent-foreground"
                        : "bg-secondary text-muted-foreground",
                  )}
                >
                  {isClaimed ? (
                    <>
                      <Check className="size-3.5" /> Награда получена
                    </>
                  ) : done ? (
                    <>
                      <Trophy className="size-3.5" /> Забрать награду
                    </>
                  ) : (
                    "В процессе…"
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </section>

      {/* Actions */}
      <section className="overflow-hidden rounded-3xl border border-border bg-card">
        <Row icon={Crosshair} label="Мои игры и роли" />
        <Row icon={Share2} label="Поделиться профилем" />
        <Row icon={Settings} label="Настройки" last />
      </section>

      <p className="pb-2 text-center text-xs text-muted-foreground">NEXUS · Telegram Mini App · v1.0</p>
    </div>
  )
}

function CoinStat({ img, value, label }: { img: string; value: number; label: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 text-center">
      <img src={img || "/placeholder.svg"} alt="" className="mx-auto size-6 rounded-full object-cover" />
      <p className="mt-1.5 font-display text-xl font-bold leading-none">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}

function StarStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 text-center">
      <Star className="mx-auto size-6 fill-stars text-stars" />
      <p className="mt-1.5 font-display text-xl font-bold leading-none">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}

function PointStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 text-center">
      <Coins className="mx-auto size-6 text-primary" />
      <p className="mt-1.5 font-display text-xl font-bold leading-none">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}

function Row({ icon: Icon, label, last }: { icon: typeof Trophy; label: string; last?: boolean }) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-secondary ${
        last ? "" : "border-b border-border"
      }`}
    >
      <Icon className="size-5 text-muted-foreground" />
      <span className="flex-1 text-sm font-medium">{label}</span>
      <ChevronRight className="size-4 text-muted-foreground" />
    </button>
  )
}
