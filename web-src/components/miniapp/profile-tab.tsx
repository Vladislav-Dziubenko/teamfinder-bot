"use client"

import { useState, useEffect, useRef } from "react"
import {
  Star,
  Trophy,
  Crown,
  Camera,
  Pencil,
  Sparkles,
  Check,
  Lock,
  Coins,
  Award,
  Gift,
  Users2,
  Copy,
  Flame,
  Globe,
  ChevronRight,
  Gamepad2,
  Share2,
  Send,
  X,
  Package,
  Infinity as InfinityIcon,
} from "lucide-react"
import { api, openLink } from "@/lib/api"
import { useI18n, LANGUAGES } from "@/lib/i18n"
import { useNexus, useMe } from "@/lib/store"
import { games, dailyStreakRewards } from "@/lib/data"
import { formatNum } from "@/lib/format"
import type { TabId } from "./bottom-nav"
import { DiscordSection } from "@/components/miniapp/discord-section"
import { cn } from "@/lib/utils"
import { LanguageSelector } from "./language-selector"
import { RoleBadge } from "./role-badge"

type AchievementItem = {
  id: string
  game: string
  title: string
  desc: string
  minutes: number
  progress: number
  points: number
  coins: number
}

const decorations = [
  { id: "orange", label: "Neon", ring: "var(--primary)", bg: "var(--primary)" },
  { id: "gold", label: "Gold", ring: "var(--stars)", bg: "var(--stars)" },
  { id: "cyan", label: "Cyber", ring: "var(--accent)", bg: "var(--accent)" },
  { id: "crimson", label: "Blood", ring: "var(--destructive)", bg: "var(--destructive)" },
]

export function ProfileTab({ onGo, onToast }: { onGo: (tab: TabId) => void; onToast: (m: string) => void }) {
  const { t } = useI18n()
  const me = useMe()
  const {
    stars,
    coins,
    points,
    premiumActive,
    avatar,
    nick,
    bio,
    deco,
    unlockedDecos,
    setAvatar,
    setNick,
    setBio,
    setDeco,
    saveProfile,
    claimedAchievements,
    invitedCount,
    referralEarned,
    referralCode,
    referralBotUrl,
    referralReward,
    simulateInvite,
    streakDay,
    lastStreakAt,
    claimDailyStreak,
    level,
    wins,
    refresh,
    setGames,
  } = useNexus()
  const { games: userGames } = useMe()

  const [editing, setEditing] = useState(false)
  const [showLang, setShowLang] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [showGamePicker, setShowGamePicker] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [achievements, setAchievements] = useState<AchievementItem[]>([])
  const [achLoading, setAchLoading] = useState(true)

  useEffect(() => {
    api.get("/api/achievements/list").then((data) => setAchievements(data?.achievements ?? data ?? [])).catch(() => setAchievements([])).finally(() => setAchLoading(false))
  }, [])
  const active = decorations.find((d) => d.id === deco) ?? decorations[0]
  const decoAvailable = (id: string) => id === "orange" || premiumActive || unlockedDecos.includes(id)
  const streakReady = !lastStreakAt || Date.now() - lastStreakAt >= 24 * 60 * 60 * 1000

  function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => setAvatar(reader.result as string)
    reader.readAsDataURL(f)
  }

  async function claim(id: string, pts: number, cns: number) {
    if (claimedAchievements.includes(id)) return
    try {
      await api.post("/api/achievements/claim", { achievement_id: id, points: pts, coins: cns })
      await refresh()
      onToast(t("profile.achievement_claimed_toast", { pts, coins: cns }))
    } catch (e: any) {
      onToast(e.message || "Ошибка")
    }
  }

  function copyRef() {
    if (!referralBotUrl) return
    const link = `${referralBotUrl}?start=${referralCode}`
    navigator.clipboard?.writeText(link).then(
      () => onToast(t("profile.referral_copied")),
      () => onToast(link),
    )
  }

  const [streakClaiming, setStreakClaiming] = useState(false)

  async function claimStreak() {
    if (streakClaiming) return
    setStreakClaiming(true)
    const res = await claimDailyStreak()
    setStreakClaiming(false)
    if (!res.ok) onToast(res.error ?? t("profile.streak_claimed"))
    else onToast(t("profile.streak_claimed_toast", { day: res.day ?? 0, coins: res.coins ?? 0 }))
  }

  return (
    <div className="space-y-5 px-4 py-5">
      {/* Profile card */}
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
              <Crown className="size-3 fill-stars" /> {t("profile.card_premium")}
            </span>
          </>
        )}

        <div className="relative flex items-center gap-4">
          <div className="relative">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative grid size-20 place-items-center overflow-hidden rounded-3xl font-display text-3xl font-bold text-primary-foreground"
              style={{ background: active.bg, boxShadow: premiumActive ? `0 0 24px -6px ${active.ring}` : "none" }}
              aria-label={t("profile.change_avatar")}
            >
              {avatar ? (
                <img src={avatar || "/placeholder.svg"} alt="Аватар" className="size-full object-cover" />
              ) : (
                nick.charAt(0).toUpperCase()
              )}
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-background/70 py-0.5 text-[9px] font-medium text-foreground">
                <Camera className="size-2.5" /> {t("profile.photo")}
              </span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={onPickPhoto} className="hidden" />
            <span className="absolute -bottom-1 -right-1 rounded-lg bg-stars px-1.5 py-0.5 font-display text-xs font-bold text-background">
              {level}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            {editing ? (
              <input
                value={nick}
                onChange={(e) => setNick(e.target.value)}
                maxLength={20}
                className="w-full rounded-lg border border-input bg-background px-2 py-1 font-display text-xl font-bold outline-none"
              />
            ) : (
              <h1 className="font-display text-2xl font-bold leading-tight">{nick}</h1>
            )}
            <p className="text-sm text-muted-foreground">{t("profile.level", { level })}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {me.role ? <RoleBadge role={me.role} /> : null}
              {me.isBeta && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/50 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                  ∞
                </span>
              )}
              {userGames.length === 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  <Gamepad2 className="size-3" /> {t("profile.no_games")}
                </span>
              ) : (
                userGames.map((gid) => {
                  const gm = games.find((g) => g.id === gid)
                  return (
                    <span
                      key={gid}
                      className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium"
                      style={{ color: gm?.color }}
                    >
                      {gm?.emoji && <span>{gm.emoji}</span>}
                      <span>{gm?.short || gid}</span>
                    </span>
                  )
                })
              )}
              <button
                type="button"
                onClick={() => setShowGamePicker(true)}
                className="inline-flex size-6 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground transition-colors hover:border-muted-foreground active:scale-90"
              >
                <svg className="size-3.5" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>
          </div>
        </div>

        {/* Editable bio */}
        <div className="mt-4">
          {editing ? (
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

        {/* Decorations */}
        <div className="mt-4">
          <p className="mb-2 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
            <Sparkles className="size-3.5 text-stars" /> {t("profile.deco_title")}
            {!premiumActive && <span className="text-[10px] font-normal">{t("profile.deco_hint")}</span>}
          </p>
          <div className="flex flex-wrap gap-2">
            {decorations.map((d) => {
              const avail = decoAvailable(d.id)
              return (
                <button
                  key={d.id}
                  type="button"
                  disabled={!avail}
                  onClick={() => setDeco(d.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-40",
                    deco === d.id ? "border-transparent text-background" : "border-border text-muted-foreground",
                  )}
                  style={deco === d.id ? { background: d.bg } : undefined}
                >
                  {avail ? (
                    <span className="size-2.5 rounded-full" style={{ background: d.bg }} />
                  ) : (
                    <Lock className="size-3" />
                  )}
                  {d.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Edit controls — бесплатно для всех */}
        <div className="mt-4">
          <button
            type="button"
            onClick={async () => {
              if (editing) {
                await saveProfile()
                onToast(t("profile.saved"))
              }
              setEditing((e) => !e)
            }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground active:scale-[0.98]"
          >
            {editing ? (
              <>
                <Check className="size-4" /> {t("profile.save_profile")}
              </>
            ) : (
              <>
                <Pencil className="size-4" /> {t("profile.edit_profile")}
              </>
            )}
          </button>
          <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
            {t("profile.edit_hint")}
          </p>
        </div>
      </section>

      {/* Discord connection */}
      <DiscordSection />

      {/* Daily streak — тренд-фишка */}
      <section className="rounded-3xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-base font-bold">
            <Flame className="size-4 text-primary" /> {t("profile.streak_title")}
          </h2>
          <span className="text-[11px] font-semibold text-muted-foreground">{t("profile.streak_count", { count: streakDay })}</span>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {dailyStreakRewards.map((r) => {
            const reached = streakDay >= r.day
            return (
              <div
                key={r.day}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border py-2 text-center",
                  reached ? "border-primary/50 bg-primary/10" : "border-border bg-background/40",
                )}
              >
                <span className="text-[9px] text-muted-foreground">{t("profile.streak_day", { day: r.day })}</span>
                <img src="/nexus-coin.webp" alt="" className="size-4 rounded-full" />
                <span className="text-[9px] font-bold">{r.coins}</span>
              </div>
            )
          })}
        </div>
        <button
          type="button"
          disabled={!streakReady || streakClaiming}
          onClick={claimStreak}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-3 text-sm font-bold text-accent-foreground active:scale-[0.98] disabled:opacity-50"
        >
          <Gift className="size-4" /> {streakReady ? t("profile.streak_claim") : t("profile.streak_claimed")}
        </button>
      </section>

      {/* Referral program */}
      <section className="relative overflow-hidden rounded-3xl border border-accent/30 bg-accent/5 p-4">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-accent/15 text-accent">
            <Users2 className="size-5" />
          </span>
          <div>
            <h2 className="font-display text-base font-bold">{t("profile.referral_title")}</h2>
            <p className="text-[11px] text-muted-foreground">
              {t("profile.referral_reward", { coins: referralReward.coins, stars: referralReward.stars })}
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-border bg-background/40 p-3 text-center">
            <p className="font-display text-xl font-bold leading-none">{invitedCount}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{t("profile.referral_invited")}</p>
          </div>
          <div className="rounded-2xl border border-border bg-background/40 p-3 text-center">
            <p className="flex items-center justify-center gap-1 font-display text-xl font-bold leading-none">
              <img src="/nexus-coin.webp" alt="" className="size-4 rounded-full" /> {referralEarned}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{t("profile.referral_earned")}</p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-border bg-background/40 px-3 py-2.5">
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
            {referralBotUrl ? `${referralBotUrl}?start=${referralCode}` : "—"}
          </span>
          <button
            type="button"
            onClick={copyRef}
            className="flex shrink-0 items-center gap-1 rounded-xl bg-accent px-2.5 py-1.5 text-xs font-bold text-accent-foreground active:scale-95"
          >
            <Copy className="size-3.5" /> {t("profile.referral_copy")}
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            if (!me.referralBotUrl) return
            const link = me.referralBotUrl + "?start=" + me.referralCode
            const shareUrl = "https://t.me/share/url?url=" + encodeURIComponent(link) + "&text=" + encodeURIComponent("🎮 Присоединяйся ко мне в TeamFinder!")
            try {
              const wa = (window as any).Telegram?.WebApp
              if (wa?.openTelegramLink) {
                wa.openTelegramLink(shareUrl)
              } else {
                window.open(shareUrl, "_blank")
              }
            } catch {}
            onToast(t("profile.referral_shared"))
          }}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-accent/40 bg-accent/10 py-2.5 text-xs font-semibold text-accent active:scale-95"
        >
          <Share2 className="size-3.5" /> {t("profile.referral_share")}
        </button>
      </section>

      {/* Premium promo (если не активен) */}
      {!premiumActive && (
        <section className="relative overflow-hidden rounded-3xl border border-stars/40 bg-stars/5 p-4">
          <div className="flex items-center gap-3">
            <img src="/premium-reveal.webp" alt="" className="size-16 shrink-0 object-contain" />
            <div className="min-w-0">
              <p className="font-display text-base font-bold">{t("profile.premium_title")}</p>
              <p className="text-xs text-muted-foreground text-pretty">
                {t("profile.premium_desc")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onGo("cases")}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-stars py-3 font-display text-base font-bold text-background active:scale-[0.98]"
          >
            <Crown className="size-5" /> {t("profile.premium_cta")}
          </button>
        </section>
      )}

        {me.isBeta && (
          <section className="relative overflow-hidden rounded-3xl border border-emerald-500/40 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-500/15 text-xl font-bold text-emerald-400">∞</span>
              <div className="min-w-0">
                <p className="font-display text-base font-bold">{t("beta.title")}</p>
                <p className="text-xs text-emerald-400/80">{t("beta.role")}</p>
              </div>
            </div>
            <ul className="mt-3 space-y-1.5 text-xs">
              <li className="flex items-center gap-2"><Package className="size-3.5 text-emerald-400" /> {t("beta.cases")}</li>
              <li className="flex items-center gap-2"><Star className="size-3.5 text-emerald-400" /> {t("beta.stars")}</li>
              <li className="flex items-center gap-2"><InfinityIcon /> {t("beta.quests")}</li>
              <li className="flex items-center gap-2"><Crown className="size-3.5 text-emerald-400" /> {t("beta.features")}</li>
            </ul>
          </section>
        )}

      {/* Currency stats */}
      <section className="grid grid-cols-3 gap-3">
        <CoinStat img="/nexus-coin.webp" value={coins} label={t("profile.stat_coins")} />
        <StarStat value={stars} label={t("profile.stat_stars")} />
        <PointStat value={points} label={t("profile.stat_points")} />
      </section>

      {/* Achievements with rewards */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
          <Award className="size-5 text-primary" /> {t("profile.achievements_title")}
        </h2>
        {achLoading ? (
          <div className="flex justify-center py-8">
            <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-3">
            {achievements.map((a) => {
              const done = a.progress >= a.minutes
              const isClaimed = claimedAchievements.includes(a.id)
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
                        +{a.points} <span className="text-[10px] font-medium text-muted-foreground">{t("profile.stat_points")}</span>
                      </p>
                      <p className="flex items-center justify-end gap-1 text-xs font-bold text-foreground">
                        <img src="/nexus-coin.webp" alt="" className="size-3.5 rounded-full" /> +{a.coins}
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
                        <Check className="size-3.5" /> {t("profile.achievement_claimed")}
                      </>
                    ) : done ? (
                      <>
                        <Trophy className="size-3.5" /> {t("profile.achievement_claim")}
                      </>
                    ) : (
                      t("profile.achievement_progress")
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Share Profile */}
      <button
        type="button"
        onClick={() => setShowShare(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 text-left active:bg-secondary"
      >
        <Share2 className="size-5 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t("profile.share_title")}</p>
          <p className="text-xs text-muted-foreground">{t("profile.share_hint")}</p>
        </div>
        <ChevronRight className="size-4 text-muted-foreground shrink-0" />
      </button>

      {showShare && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={() => setShowShare(false)}
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
          />
          <div className="relative mx-auto w-full max-w-md rounded-t-3xl border-t border-border bg-card p-5 pb-8 animate-rise">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted-foreground/40" />
            <button
              type="button"
              onClick={() => setShowShare(false)}
              className="absolute right-4 top-4 grid size-8 place-items-center rounded-lg text-muted-foreground active:bg-secondary"
            >
              <X className="size-4" />
            </button>
            <p className="mb-4 text-center font-display text-base font-bold">{t("profile.share_menu_title")}</p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  if (!me.referralBotUrl) return
                  const link = me.referralBotUrl + "?start=profile_" + me.userId
                  navigator.clipboard.writeText(link).catch(() => {})
                  setShowShare(false)
                  onToast(t("profile.share_copied"))
                }}
                className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 text-left active:bg-secondary"
              >
                <Copy className="size-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">{t("profile.share_copy")}</p>
                  <p className="text-xs text-muted-foreground">{t("profile.share_copy_hint")}</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!me.referralBotUrl) return
                  const link = me.referralBotUrl + "?start=profile_" + me.userId
                  setShowShare(false)
                  const shareUrl = "https://t.me/share/url?url=" + encodeURIComponent(link) + "&text=" + encodeURIComponent("👋 Загляни в мой профиль в TeamFinder!")
                  try {
                    const wa = (window as any).Telegram?.WebApp
                    if (wa?.openTelegramLink) {
                      wa.openTelegramLink(shareUrl)
                    } else {
                      window.open(shareUrl, "_blank")
                    }
                  } catch {}
                }}
                className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 text-left active:bg-secondary"
              >
                <Send className="size-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">{t("profile.share_telegram")}</p>
                  <p className="text-xs text-muted-foreground">{t("profile.share_telegram_hint")}</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Language */}
      <button
        type="button"
        onClick={() => setShowLang(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 text-left active:bg-secondary"
      >
        <Globe className="size-5 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t("lang.title")}</p>
          <p className="text-xs text-muted-foreground">{t("lang.subtitle")}</p>
        </div>
        <ChevronRight className="size-4 text-muted-foreground shrink-0" />
      </button>

      {showLang && <LanguageSelector onClose={() => setShowLang(false)} />}

      {/* Game picker modal */}
      {showGamePicker && (
        <GamePicker
          selected={userGames}
          onSave={(g) => {
            setGames(g)
            setShowGamePicker(false)
          }}
          onClose={() => setShowGamePicker(false)}
        />
      )}

      <p className="pb-2 text-center text-xs text-muted-foreground">NEXUS · Telegram Mini App · v1.1</p>
    </div>
  )
}

function CoinStat({ img, value, label }: { img: string; value: number; label: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 text-center">
      <img src={img || "/placeholder.svg"} alt="" className="mx-auto size-6 rounded-full object-cover" />
      <p className="mt-1.5 font-display text-xl font-bold leading-none">{formatNum(value)}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}

function StarStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 text-center">
      <Star className="mx-auto size-6 fill-stars text-stars" />
      <p className="mt-1.5 font-display text-xl font-bold leading-none">{formatNum(value)}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}

function PointStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 text-center">
      <Coins className="mx-auto size-6 text-primary" />
      <p className="mt-1.5 font-display text-xl font-bold leading-none">{formatNum(value)}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}

function GamePicker({ selected, onSave, onClose }: { selected: string[]; onSave: (g: string[]) => void; onClose: () => void }) {
  const { t } = useI18n()
  const [picked, setPicked] = useState<string[]>(selected)

  function toggle(gid: string) {
    setPicked((prev) => prev.includes(gid) ? prev.filter((x) => x !== gid) : [...prev, gid])
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/60 px-4 pb-8" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 font-display text-lg font-bold">{t("profile.game_picker_title")}</h3>
        <p className="mb-4 text-sm text-muted-foreground">{t("profile.game_picker_desc")}</p>
        <div className="flex flex-wrap gap-2">
          {games.map((g) => {
            const on = picked.includes(g.id)
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => toggle(g.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition-all active:scale-95",
                  on
                    ? "border-stars/40 bg-stars/12 text-stars"
                    : "border-border bg-secondary/50 text-muted-foreground",
                )}
              >
                <span>{g.emoji}</span>
                <span>{g.short}</span>
                {on && <Check className="size-3.5 fill-stars" />}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => onSave(picked)}
          className="mt-5 w-full rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground active:scale-[0.98]"
        >
          {t("common.save")}
        </button>
      </div>
    </div>
  )
}


