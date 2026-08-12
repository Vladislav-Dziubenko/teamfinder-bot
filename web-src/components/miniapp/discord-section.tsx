"use client"

import { Gift, Star } from "lucide-react"
import { useDiscord } from "@/lib/hooks/useDiscord"
import { useI18n } from "@/lib/i18n"
import { useNexus } from "@/lib/store"

export function DiscordSection() {
  const { t } = useI18n()
  const { status, loading, busy, error, connect, unlink, claimDaily, claimQuest, syncProfile, refresh: refreshStatus } = useDiscord()
  const { refresh: refreshMe } = useNexus()

  const linked = !!status?.linked
  const questTarget = status?.quest_target ?? 7
  const questCount = status?.daily_claims_count ?? 0
  const questDone = questCount >= questTarget
  const questClaimed = !!status?.quest_claimed_at
  const questBonus = status?.quest_bonus ?? 50

  async function onClaimDaily() {
    const res = await claimDaily()
    if (res.ok) {
      await refreshStatus()
      await refreshMe()
    }
  }

  async function onClaimQuest() {
    const res = await claimQuest()
    if (res.ok) {
      await refreshStatus()
      await refreshMe()
    }
  }

  async function onSyncProfile() {
    const ok = await syncProfile()
    if (ok) {
      await refreshStatus()
      await refreshMe()
    }
  }

  return (
    <section className="rounded-2xl bg-neutral-900/60 border border-neutral-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#5865F2] flex items-center justify-center text-white font-bold">
            D
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Discord</div>
            <div className="text-xs text-neutral-400">
              {t("discord.section_desc")}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-xs text-neutral-500">{t("profile.discord_loading")}</div>
      ) : linked ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {status.avatar_url ? (
                <img
                  src={status.avatar_url}
                  alt=""
                  className="w-8 h-8 rounded-full"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-neutral-700" />
              )}
              <div className="min-w-0">
                <div className="text-sm text-white truncate">
                  {status.global_name || status.username || "Discord user"}
                </div>
                {status.username && (
                  <div className="text-xs text-neutral-400 truncate">
                    @{status.username}
                  </div>
                )}
              </div>
            </div>
              <button
                onClick={unlink}
                disabled={busy}
                className="text-xs px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white disabled:opacity-50"
              >
                {busy ? "…" : t("profile.discord_unlink")}
              </button>
            </div>

            <button
              onClick={onSyncProfile}
              disabled={busy}
              className="w-full rounded-lg bg-neutral-800 hover:bg-neutral-700 px-3 py-2 text-[11px] font-medium text-white disabled:opacity-50"
            >
              {busy ? "…" : t("discord.use_profile")}
            </button>

          <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
            <div className="text-[11px] font-semibold text-neutral-300">
              {t("discord.rewards_title")}
            </div>
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-neutral-800">
                    <Gift className="size-3.5 text-[#5865F2]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-white">
                      {t("discord.welcome_title")}
                    </div>
                    <div className="text-[10px] text-neutral-400">
                      {t("discord.welcome_desc")}
                    </div>
                  </div>
                </div>
                <span
                  className={`shrink-0 text-[10px] font-semibold ${
                    status.welcome_claimed ? "text-neutral-500" : "text-emerald-400"
                  }`}
                >
                  {status.welcome_claimed ? t("discord.welcome_claimed") : "✓"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-neutral-800">
                    <Star className="size-3.5 fill-amber-400 text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-white">
                      {t("discord.daily_title")}
                    </div>
                    <div className="text-[10px] text-neutral-400">
                      {t("discord.daily_desc")}
                    </div>
                  </div>
                </div>
                {status.daily_ready ? (
                  <button
                    onClick={onClaimDaily}
                    disabled={busy}
                    className="shrink-0 rounded-lg bg-emerald-500/90 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {busy ? "…" : t("discord.daily_claim")}
                  </button>
                ) : (
                  <span className="shrink-0 text-[10px] font-semibold text-neutral-500">
                    {t("discord.daily_claimed")}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-neutral-800">
                    <Star className="size-3.5 fill-amber-400 text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-white">
                      {t("discord.quest_title")}
                    </div>
                    <div className="text-[10px] text-neutral-400">
                      {t("discord.quest_desc", { count: questTarget, bonus: questBonus })}
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                      <div
                        className="h-full rounded-full bg-amber-400"
                        style={{ width: `${Math.min(100, Math.round((questCount / questTarget) * 100))}%` }}
                      />
                    </div>
                  </div>
                </div>
                {questClaimed ? (
                  <span className="shrink-0 text-[10px] font-semibold text-neutral-500">
                    {t("discord.quest_claimed")}
                  </span>
                ) : questDone ? (
                  <button
                    onClick={onClaimQuest}
                    disabled={busy}
                    className="shrink-0 rounded-lg bg-amber-400 px-2.5 py-1.5 text-[10px] font-bold text-black hover:bg-amber-300 disabled:opacity-50"
                  >
                    {busy ? "…" : t("discord.quest_claim", { bonus: questBonus })}
                  </button>
                ) : (
                  <span className="shrink-0 text-[10px] font-semibold text-neutral-500">
                    {questCount}/{questTarget}
                  </span>
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <button
            onClick={connect}
            disabled={busy}
            className="w-full py-2.5 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white text-sm font-semibold disabled:opacity-50"
          >
            {busy ? t("discord.opening") : t("profile.discord_connect")}
          </button>
          <div className="text-[10px] text-neutral-500">
            {t("discord.welcome_title")}: {t("discord.welcome_desc")}
          </div>
        </>
      )}

      {error && (
        <div className="text-xs text-red-400 break-words">{error}</div>
      )}
    </section>
  )
}