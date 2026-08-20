"use client"

import { Check } from "lucide-react"
import { useSteam } from "@/lib/hooks/useSteam"
import { useI18n } from "@/lib/i18n"
import { useNexus } from "@/lib/store"

function formatHours(minutes?: number): string {
  if (!minutes) return "0"
  return (minutes / 60).toFixed(0)
}

export function SteamSection() {
  const { t } = useI18n()
  const { status, loading, busy, error, connect, unlink, refresh: refreshStatus } = useSteam()
  const { refresh: refreshMe } = useNexus()

  const linked = !!status?.linked

  return (
    <section className="rounded-2xl bg-neutral-900/60 border border-neutral-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#1B2838] flex items-center justify-center text-white font-bold">
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.5 14.1c-.44 0-.86-.1-1.23-.28l-3.02 1.5c.1.46.1.94 0 1.41-.27 1.24-1.36 2.1-2.6 2.1h-.06c-.62-.03-1.18-.3-1.57-.75-.39-.45-.55-1.05-.45-1.63.11-.57.46-1.05.96-1.35.5-.29 1.11-.36 1.67-.18l2.93-1.46c-.02-.77.03-1.56.2-2.31l-.16-.1-2.68 1.35c-.11-.6-.42-1.18-.9-1.61-.7-.63-1.7-.78-2.57-.39-.68.31-1.21.92-1.43 1.64-.21.73-.13 1.51.21 2.17.34.67.94 1.16 1.67 1.36-.47 1.36-1.76 2.15-3.16 1.93-.97-.14-1.78-.72-2.22-1.59-.44-.87-.36-1.88.22-2.66.32-.44.76-.76 1.27-.93-.6-1.13-1.04-2.43-.36-3.51.62-.98 1.79-1.36 2.91-1.11 1.06.23 1.9.97 2.35 1.95l1.2-.6c-.66-1.53-1.12-3.28-.31-4.95.72-1.48 2.31-2.19 3.89-1.78.98.25 1.77.94 2.16 1.86.37.87.29 1.79-.09 2.61.4.22.75.52 1.04.87l.52-.25c.7-.35 1.53-.09 1.88.61.35.7.09 1.53-.61 1.88l-.52.25c.36.61.54 1.29.54 2 0 1.77-1.44 3.21-3.21 3.21zm-6.5-8.7c-.94.46-1.33 1.59-.87 2.53.46.94 1.59 1.33 2.53.87.94-.46 1.33-1.59.87-2.53-.46-.94-1.59-1.33-2.53-.87z" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Steam</div>
            <div className="text-xs text-neutral-400">
              {t("steam.section_desc")}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-xs text-neutral-500">{t("profile.steam_loading")}</div>
      ) : linked ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {status.avatar ? (
                <img
                  src={status.avatar}
                  alt=""
                  className="w-8 h-8 rounded-full"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-neutral-700" />
              )}
              <div className="min-w-0">
                <div className="text-sm text-white truncate">
                  {status.username || "Steam user"}
                </div>
                {status.real_name && (
                  <div className="text-xs text-neutral-400 truncate">
                    {status.real_name}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={unlink}
              disabled={busy}
              className="text-xs px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white disabled:opacity-50"
            >
              {busy ? "…" : t("profile.steam_unlink")}
            </button>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3 space-y-2">
            <div className="text-[11px] font-semibold text-neutral-300">
              {t("steam.cs2_stats_title")}
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-neutral-400">
                {t("steam.hours_in_cs2")}
              </div>
              <div className="text-xs font-semibold text-white">
                {formatHours(status.cs2_minutes)} ч
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-neutral-400">
                {t("steam.kills_in_cs2")}
              </div>
              <div className="text-xs font-semibold text-white">
                {status.cs2_kills?.toLocaleString() ?? "0"}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-neutral-800">
                <Check className="size-3.5 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-white">
                  {t("steam.verified_title")}
                </div>
                <div className="text-[10px] text-neutral-400">
                  {t("steam.verified_desc")}
                </div>
              </div>
            </div>
            {status.welcome_claimed ? (
              <span className="shrink-0 text-[10px] font-semibold text-neutral-500">
                {t("steam.welcome_claimed")}
              </span>
            ) : (
              <span className="shrink-0 text-[10px] font-semibold text-emerald-400">
                {t("steam.welcome_pending")}
              </span>
            )}
          </div>
        </>
      ) : (
        <>
          <button
            onClick={connect}
            disabled={busy}
            className="w-full py-2.5 rounded-xl bg-[#1B2838] hover:bg-[#2A475E] text-white text-sm font-semibold disabled:opacity-50"
          >
            {busy ? t("steam.opening") : t("profile.steam_connect")}
          </button>
          <div className="text-[10px] text-neutral-500">
            {t("steam.welcome_title")}: {t("steam.welcome_desc")}
          </div>
        </>
      )}

      {error && (
        <div className="text-xs text-red-400 break-words">{error}</div>
      )}
    </section>
  )
}