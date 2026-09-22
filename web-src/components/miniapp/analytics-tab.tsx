"use client"

import { useCallback, useEffect, useState } from "react"
import { Activity, Loader2, Lock } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { useNexus } from "@/lib/store"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

type Overview = {
  days: number
  total_users: number
  new_today: number
  dau: number
  wau: number
  mau: number
  returning: number
  retention: Record<string, { cohort_day: string; cohort: number; returned: number; rate: number | null }>
  search: Record<string, { events: number; users: number }>
  notifications: {
    sent: number
    sent_users: number
    opened_events: number
    opened_users: number
    conversion: number | null
  }
  funnel: { event: string; users: number; conversion: number | null }[]
  series: { day: string; new_users: number; dau: number }[]
  error?: string
}

function pct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return `${(v * 100).toFixed(1)}%`
}

function num(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return v.toLocaleString("ru-RU")
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

export function AnalyticsTab() {
  const { t, lang } = useI18n()
  const { role } = useNexus()
  const [days, setDays] = useState<7 | 30 | 90>(30)
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setForbidden(false)
    try {
      const res: any = await api.get(`/api/analytics/overview?days=${days}`)
      setData(res)
    } catch (e: any) {
      if (e?.status === 403) {
        setForbidden(true)
        setData(null)
      } else {
        setData(null)
      }
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    if (role === "developer") load()
    else setLoading(false)
  }, [role, load])

  // Двойная защита: без роли разработчика страницу не рендерим вообще.
  // Данные всё равно отдаёт только бэкенд после своей проверки.
  if (role !== "developer") {
    return (
      <div className="space-y-4 px-4 py-5">
        <div className="rounded-3xl border border-dashed border-border py-12 text-center">
          <Lock className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">{t("analytics.forbidden")}</p>
        </div>
      </div>
    )
  }

  const funnelLabels: Record<string, string> = {
    first_open: t("analytics.funnel_first_open"),
    registration_completed: t("analytics.funnel_registered"),
    teammate_search_started: t("analytics.funnel_search"),
    teammate_found: t("analytics.funnel_found"),
    teammate_profile_opened: t("analytics.funnel_profile"),
    returned_later: t("analytics.funnel_returned"),
  }

  const maxDau = Math.max(1, ...(data?.series.map((s) => s.dau) ?? [1]))

  return (
    <div className="space-y-4 px-4 py-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold">
            <Activity className="size-6 text-primary" /> {t("analytics.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("analytics.subtitle")}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-2xl border border-border bg-card p-1">
        {([7, 30, 90] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            className={cn(
              "rounded-xl px-3 py-2 text-sm font-bold transition-colors",
              days === d ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            {t("analytics.days", { n: d })}
          </button>
        ))}
      </div>

      {loading && <Loader2 className="mx-auto mt-6 size-6 animate-spin text-muted-foreground" />}

      {!loading && (forbidden || !data) && (
        <div className="rounded-3xl border border-dashed border-border py-12 text-center">
          <Lock className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            {forbidden ? t("analytics.forbidden") : t("analytics.no_data")}
          </p>
        </div>
      )}

      {!loading && data && !forbidden && (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <Card label={t("analytics.total_users")} value={num(data.total_users)} />
            <Card label={t("analytics.new_today")} value={num(data.new_today)} />
            <Card label="DAU" value={num(data.dau)} />
            <Card label="WAU" value={num(data.wau)} />
            <Card label="MAU" value={num(data.mau)} />
            <Card
              label={t("analytics.returning")}
              value={num(data.returning)}
              sub={t("analytics.returning_hint", { n: data.days })}
            />
          </div>

          <section className="rounded-3xl border border-border bg-card p-4">
            <h2 className="font-display text-base font-bold">{t("analytics.retention_title")}</h2>
            <div className="mt-3 space-y-2.5">
              {(["d1", "d7", "d30"] as const).map((k) => {
                const r = data.retention?.[k]
                if (!r) return null
                return (
                  <div key={k}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-bold">{k.toUpperCase()}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {num(r.returned)}/{num(r.cohort)}
                        {r.cohort_day ? ` · ${r.cohort_day}` : ""}
                      </span>
                      <span className="font-display text-base font-bold text-primary tabular-nums">
                        {pct(r.rate)}
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all"
                        style={{ width: `${Math.min(100, (r.rate ?? 0) * 100)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">{t("analytics.retention_hint")}</p>
          </section>

          <section className="rounded-3xl border border-border bg-card p-4">
            <h2 className="font-display text-base font-bold">{t("analytics.search_title")}</h2>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {(
                [
                  ["teammate_search_started", t("analytics.search_started")],
                  ["teammate_search_empty", t("analytics.search_empty")],
                  ["teammate_found", t("analytics.search_found")],
                ] as const
              ).map(([key, label]) => {
                const s = data.search?.[key]
                return (
                  <div key={key} className="rounded-2xl bg-secondary/50 p-2.5">
                    <p className="font-display text-lg font-bold tabular-nums">{num(s?.events)}</p>
                    <p className="text-[10px] leading-tight text-muted-foreground">
                      {label}
                      <br />Ø {num(s?.users)}
                    </p>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-card p-4">
            <h2 className="font-display text-base font-bold">{t("analytics.notif_title")}</h2>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <Card label={t("analytics.notif_sent")} value={num(data.notifications?.sent)} />
              <Card
                label={t("analytics.notif_conversion")}
                value={pct(data.notifications?.conversion)}
                sub={
                  lang === "ru"
                    ? `${num(data.notifications?.opened_users)} из ${num(data.notifications?.sent_users)}`
                    : `${num(data.notifications?.opened_users)} of ${num(data.notifications?.sent_users)}`
                }
              />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {t("analytics.notif_hint", {
                users: num(data.notifications?.sent_users),
                opened: num(data.notifications?.opened_users),
              })}
            </p>
          </section>

          <section className="rounded-3xl border border-border bg-card p-4">
            <h2 className="font-display text-base font-bold">{t("analytics.funnel_title")}</h2>
            <div className="mt-3 space-y-2.5">
              {(data.funnel ?? []).map((f) => (
                <div key={f.event}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {funnelLabels[f.event] ?? f.event}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {num(f.users)}
                      {f.conversion != null ? ` · ${pct(f.conversion)}` : ""}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{
                        width: `${Math.min(
                          100,
                          ((f.users || 0) / Math.max(1, data.funnel?.[0]?.users || 1)) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-card p-4">
            <h2 className="font-display text-base font-bold">{t("analytics.activity_title")}</h2>
            <div className="mt-3 flex h-28 items-end gap-[3px]">
              {(data.series ?? []).map((s) => (
                <div
                  key={s.day}
                  title={`${s.day}: DAU ${s.dau}, +${s.new_users}`}
                  className="min-w-0 flex-1 rounded-t bg-primary/70"
                  style={{ height: `${Math.max(4, (s.dau / maxDau) * 100)}%` }}
                />
              ))}
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground tabular-nums">
              <span>{data.series?.[0]?.day ?? ""}</span>
              <span>
                {t("analytics.activity_legend", {
                  dau: num(data.series?.reduce((a, s) => a + s.dau, 0)),
                  nu: num(data.series?.reduce((a, s) => a + s.new_users, 0)),
                })}
              </span>
              <span>{data.series?.[data.series.length - 1]?.day ?? ""}</span>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
