"use client"

import { useState } from "react"
import {
  TrendingUp,
  Swords,
  Info,
  Coins,
  Clock,
  Trophy,
  CircleDot,
  CheckCircle2,
  Hourglass,
  Plus,
  Gamepad2,
} from "lucide-react"
import { useNexus } from "@/lib/store"
import {
  usePredictions,
  ME_ID,
  type EsportsMatch,
  type MatchPrediction,
  type PvpChallenge,
} from "@/lib/predictions"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type Mode = "esports" | "pvp"

export function PredictionsTab({ onToast }: { onToast?: (m: string) => void }) {
  const { coins: storeCoins, nick, refresh } = useNexus()
  const { t } = useI18n()
  const p = usePredictions(storeCoins, nick, refresh)
  const [mode, setMode] = useState<Mode>("esports")

  return (
    <div className="space-y-4 px-4 py-5">
      <div>
        <h1 className="font-display text-2xl font-bold">{t("predictions.title")}</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          {t("predictions.subtitle")}
        </p>
      </div>

      {/* Balance + rule */}
      <div className="rounded-3xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{t("predictions.balance")}</span>
          <span className="flex items-center gap-1.5 font-display text-lg font-bold text-primary">
            <Coins className="size-4" />
            {p.coins}
            <span className="text-sm font-medium text-muted-foreground">{t("predictions.currency")}</span>
          </span>
        </div>
        <p className="mt-3 flex items-start gap-2 rounded-2xl bg-accent/10 px-3 py-2 text-[11px] leading-relaxed text-accent">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {t("predictions.info")}
        </p>
      </div>

      {/* Mode switch */}
      <div className="flex rounded-2xl border border-border bg-card p-1">
        {(
          [
            { m: "esports", label: t("predictions.mode_esports"), icon: TrendingUp },
            { m: "pvp", label: t("predictions.mode_pvp"), icon: Swords },
          ] as const
        ).map(({ m, label, icon: Icon }) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition-colors",
              mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {mode === "esports" ? <EsportsMode p={p} onToast={onToast} /> : <PvpMode p={p} onToast={onToast} />}
    </div>
  )
}

/* ------------------------- Режим A: киберспорт ------------------------- */

function EsportsMode({
  p,
  onToast,
}: {
  p: ReturnType<typeof usePredictions>
  onToast?: (m: string) => void
}) {
  const { t } = useI18n()
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h2 className="font-display text-base font-bold">{t("predictions.matches_title")}</h2>
        <p className="text-[11px] leading-relaxed text-muted-foreground">{t("predictions.auto_settle")}</p>
        {p.matches.map((m) => (
          <MatchCard key={m.id} match={m} onPlace={p.placePrediction} onToast={onToast} />
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-base font-bold">{t("predictions.history_title")}</h2>
        {p.predictions.length === 0 ? (
          <Empty text={t("predictions.history_empty")} />
        ) : (
          p.predictions.map((h) => <HistoryRow key={h.id} item={h} />)
        )}
      </section>
    </div>
  )
}

function MatchCard({
  match,
  onPlace,
  onToast,
}: {
  match: EsportsMatch
  onPlace: (m: EsportsMatch, side: "A" | "B", amount: number) => Promise<{ ok: boolean; error?: string }>
  onToast?: (m: string) => void
}) {
  const { t } = useI18n()
  const [side, setSide] = useState<"A" | "B" | null>(null)
  const [amount, setAmount] = useState("")

  const bettingOpen = match.status === "upcoming" && match.startsAt > Date.now()
  const winnerTeam = match.winner ? (match.winner === "A" ? match.teamA : match.teamB) : null

  async function confirm() {
    if (!side) return
    const res = await onPlace(match, side, Number(amount) || 0)
    if (!res.ok) {
      onToast?.(res.error ?? t("common.error"))
      return
    }
    onToast?.(t("predictions.bet_placed", { team: side === "A" ? match.teamA : match.teamB }))
    setSide(null)
    setAmount("")
  }

  const potential = side ? Math.round((Number(amount) || 0) * (side === "A" ? match.oddsA : match.oddsB)) : 0

  return (
    <article className="overflow-hidden rounded-3xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-accent">
          <Gamepad2 className="size-3.5" />
          {match.discipline}
        </span>
        {match.status === "finished" ? (
          <span className="flex items-center gap-1 text-[11px] font-bold text-primary">
            <Trophy className="size-3" />
            {winnerTeam ? t("predictions.won", { team: winnerTeam }) : t("predictions.finished")}
          </span>
        ) : match.status === "live" ? (
          <span className="flex items-center gap-1 text-[11px] font-bold text-destructive">
            <CircleDot className="size-3" />
            {t("predictions.live")}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="size-3" />
            {startLabel(match.startsAt)}
          </span>
        )}
      </div>

      <div className="px-4 py-3">
        <p className="mb-3 truncate text-center text-[11px] text-muted-foreground">{match.tournament}</p>
        <div className="grid grid-cols-2 gap-2">
          <OddButton
            team={match.teamA}
            odds={match.oddsA}
            active={side === "A"}
            disabled={!bettingOpen}
            onClick={() => setSide(side === "A" ? null : "A")}
          />
          <OddButton
            team={match.teamB}
            odds={match.oddsB}
            active={side === "B"}
            disabled={!bettingOpen}
            onClick={() => setSide(side === "B" ? null : "B")}
          />
        </div>

        {match.status === "live" && (
          <p className="mt-3 rounded-2xl bg-destructive/10 px-3 py-2 text-center text-[11px] font-semibold text-destructive">
            {t("predictions.live_hint")}
          </p>
        )}

        {side && bettingOpen && (
          <div className="mt-3 space-y-2 rounded-2xl bg-secondary/40 p-3">
            <div className="flex items-center gap-2">
              <Coins className="size-4 shrink-0 text-primary" />
              <input
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                placeholder={t("predictions.bet_amount")}
                className="min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
              />
            </div>
            <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground">
              <span>{t("predictions.potential_win")}</span>
              <span className="font-display text-sm font-bold text-primary">{potential} {t("predictions.currency")}</span>
            </div>
            <button
              type="button"
              onClick={confirm}
              className="w-full rounded-2xl bg-primary py-2.5 text-sm font-bold text-primary-foreground active:scale-[0.98]"
            >
              {t("predictions.place_bet", { team: side === "A" ? match.teamA : match.teamB })}
            </button>
          </div>
        )}
      </div>
    </article>
  )
}

function OddButton({
  team,
  odds,
  active,
  disabled,
  onClick,
}: {
  team: string
  odds: number
  active: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center gap-1 rounded-2xl border px-3 py-3 transition-colors",
        active ? "border-primary bg-primary/15" : "border-border bg-secondary/40",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <span className="line-clamp-1 text-sm font-semibold">{team}</span>
      <span className={cn("font-display text-lg font-bold", active ? "text-primary" : "text-foreground")}>
        {odds.toFixed(2)}
      </span>
    </button>
  )
}

function HistoryRow({ item }: { item: MatchPrediction }) {
  const { t } = useI18n()
  const meta = {
    won: { label: t("predictions.status_won"), cls: "bg-primary/15 text-primary", icon: Trophy },
    lost: { label: t("predictions.status_lost"), cls: "bg-destructive/15 text-destructive", icon: CircleDot },
    pending: { label: t("predictions.status_pending"), cls: "bg-stars/15 text-stars", icon: Hourglass },
  }[item.status]
  const Icon = meta.icon

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5">
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", meta.cls)}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{item.team}</p>
        <p className="truncate text-[11px] text-muted-foreground">{item.label}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className={cn("font-display text-sm font-bold", statusColor(item.status))}>
          {item.status === "won" ? `+${item.payout}` : item.status === "lost" ? `-${item.amount}` : item.amount}
        </p>
        <p className="text-[10px] text-muted-foreground">{t("predictions.odds", { value: item.odds.toFixed(2) })}</p>
      </div>
    </div>
  )
}

/* ------------------------- Режим B: PvP ------------------------- */

function PvpMode({
  p,
  onToast,
}: {
  p: ReturnType<typeof usePredictions>
  onToast?: (m: string) => void
}) {
  const { t } = useI18n()
  const [condition, setCondition] = useState("")
  const [stake, setStake] = useState("")
  const [open, setOpen] = useState(false)

  async function create() {
    const res = await p.createChallenge(condition, Number(stake) || 0)
    if (!res.ok) {
      onToast?.(res.error ?? t("common.error"))
      return
    }
    onToast?.(t("predictions.pvp_created"))
    setCondition("")
    setStake("")
    setOpen(false)
  }

  return (
    <div className="space-y-5">
      {/* Create challenge */}
      <section className="rounded-3xl border border-border bg-card p-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between"
        >
          <span className="flex items-center gap-2 font-display text-base font-bold">
            <Plus className="size-4 text-primary" /> {t("predictions.pvp_create")}
          </span>
        </button>

        {open && (
          <div className="mt-3 space-y-3">
            <textarea
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              rows={2}
              placeholder={t("predictions.pvp_condition_placeholder")}
              className="w-full resize-none rounded-2xl border border-input bg-background px-3 py-2.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
            />
            <div className="flex items-center gap-2">
              <Coins className="size-4 shrink-0 text-primary" />
              <input
                inputMode="numeric"
                value={stake}
                onChange={(e) => setStake(e.target.value.replace(/\D/g, ""))}
                placeholder={t("predictions.pvp_stake_placeholder")}
                className="min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
              />
            </div>
            <button
              type="button"
              onClick={create}
              className="w-full rounded-2xl bg-primary py-2.5 text-sm font-bold text-primary-foreground active:scale-[0.98]"
            >
              {t("predictions.pvp_publish")}
            </button>
          </div>
        )}
      </section>

      <p className="flex items-start gap-2 px-1 text-[11px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        {t("predictions.pvp_info")}
      </p>

      {/* Challenges */}
      <section className="space-y-3">
        <h2 className="font-display text-base font-bold">{t("predictions.pvp_challenges_title")}</h2>
        {p.challenges.length === 0 ? (
          <Empty text={t("predictions.pvp_empty")} />
        ) : (
          p.challenges.map((c) => (
            <ChallengeCard
              key={c.id}
              challenge={c}
              onAccept={async () => {
                const res = await p.acceptChallenge(c.id)
                if (!res.ok) onToast?.(res.error ?? "Не удалось")
                else onToast?.("Вызов принят!")
              }}
              onResolve={(winnerId) => {
                p.confirmResult(c.id, winnerId)
                onToast?.("Результат подтверждён")
              }}
            />
          ))
        )}
      </section>
    </div>
  )
}

function ChallengeCard({
  challenge,
  onAccept,
  onResolve,
}: {
  challenge: PvpChallenge
  onAccept: () => void
  onResolve: (winnerId: string) => void
}) {
  const { t } = useI18n()
  const isCreator = challenge.creatorId === ME_ID
  const [resolving, setResolving] = useState(false)

  const statusMeta = {
    open: { label: t("predictions.pvp_status_open"), cls: "bg-stars/15 text-stars" },
    active: { label: t("predictions.pvp_status_active"), cls: "bg-accent/15 text-accent" },
    finished: { label: t("predictions.pvp_status_finished"), cls: "bg-secondary text-muted-foreground" },
  }[challenge.status]

  const iWon = challenge.status === "finished" && challenge.winnerId === ME_ID

  return (
    <article className="rounded-3xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Swords className="size-3.5" />
          {isCreator ? t("predictions.pvp_your_challenge") : t("predictions.pvp_from", { name: challenge.creatorNick })}
        </span>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", statusMeta.cls)}>
          {statusMeta.label}
        </span>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-pretty">{challenge.condition}</p>

      <div className="mt-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm">
          <Coins className="size-4 text-primary" />
          <span className="font-display font-bold">{challenge.stake}</span>
          <span className="text-xs text-muted-foreground">{t("predictions.pvp_bank", { amount: challenge.stake * 2 })}</span>
        </span>

        {challenge.status === "open" && !isCreator && (
          <button
            type="button"
            onClick={onAccept}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground active:scale-95"
          >
            {t("predictions.pvp_accept")}
          </button>
        )}
        {challenge.status === "open" && isCreator && (
          <span className="text-xs text-muted-foreground">{t("predictions.pvp_waiting")}</span>
        )}
      </div>

      {/* Соперник */}
      {challenge.opponentNick && challenge.status !== "open" && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {t("predictions.pvp_opponent", { name: challenge.opponentNick })}
        </p>
      )}

      {/* Подтверждение результата — только создатель */}
      {challenge.status === "active" && isCreator && (
        <div className="mt-3">
          {!resolving ? (
            <button
              type="button"
              onClick={() => setResolving(true)}
              className="w-full rounded-2xl border border-primary/50 bg-primary/10 py-2.5 text-sm font-bold text-primary active:scale-[0.98]"
            >
              {t("predictions.pvp_confirm_result")}
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-center text-[11px] text-muted-foreground">{t("predictions.pvp_who_won")}</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onResolve(ME_ID)}
                  className="rounded-2xl bg-primary py-2.5 text-sm font-bold text-primary-foreground active:scale-95"
                >
                  {t("predictions.pvp_me")}
                </button>
                <button
                  type="button"
                  onClick={() => onResolve(challenge.opponentId ?? "opp")}
                  className="rounded-2xl border border-border bg-secondary/60 py-2.5 text-sm font-bold active:scale-95"
                >
                  {challenge.opponentNick ?? t("predictions.pvp_opponent_label")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Итог */}
      {challenge.status === "finished" && (
        <div
          className={cn(
            "mt-3 flex items-center justify-center gap-1.5 rounded-2xl py-2 text-sm font-bold",
            iWon ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive",
          )}
        >
          <CheckCircle2 className="size-4" />
          {iWon ? t("predictions.pvp_victory", { amount: challenge.stake * 2 }) : t("predictions.pvp_defeat")}
        </div>
      )}
    </article>
  )
}

/* ------------------------- helpers ------------------------- */

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-border py-8 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  )
}

function statusColor(status: MatchPrediction["status"]): string {
  if (status === "won") return "text-primary"
  if (status === "lost") return "text-destructive"
  return "text-muted-foreground"
}

function startLabel(ts: number): string {
  const diff = ts - Date.now()
  const h = Math.round(diff / 3600_000)
  if (h <= 0) return "скоро"
  if (h < 24) return `через ${h} ч`
  return `через ${Math.round(h / 24)} дн`
}
