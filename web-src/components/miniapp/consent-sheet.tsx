"use client"

import { useState } from "react"
import { Check, ShieldCheck, AlertTriangle, Sparkles } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { CONSENT_VERSION } from "@/lib/store"
import { cn } from "@/lib/utils"

export function ConsentSheet({ onAccept }: { onAccept: () => void }) {
  const { t } = useI18n()
  const [cb1, setCb1] = useState(false)
  const [cb2, setCb2] = useState(false)
  const ready = cb1 && cb2

  return (
    <div className="fixed inset-0 z-[120] flex flex-col overflow-y-auto bg-background">
      {/* Градиентная шапка */}
      <div className="relative shrink-0 overflow-hidden bg-gradient-to-b from-primary/25 via-accent/10 to-background px-6 pb-10 pt-14 text-center">
        <div className="pointer-events-none absolute -top-10 left-1/2 h-44 w-72 -translate-x-1/2 rounded-full bg-primary/30 blur-3xl" />
        <div className="relative mx-auto grid size-16 place-items-center rounded-3xl bg-gradient-to-br from-[#ffd700] to-[#ff9d00] shadow-[0_10px_40px_-10px_rgba(255,215,0,0.8)]">
          <Sparkles className="size-8 text-black" />
        </div>
        <h1 className="relative mt-4 font-display text-2xl font-bold">{t("consent.title")}</h1>
        <p className="relative mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">{t("consent.subtitle")}</p>
      </div>

      <div className="flex-1 space-y-4 px-5 pb-8">
        {/* Конфиденциальность */}
        <div className="rounded-3xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
              <ShieldCheck className="size-5" />
            </span>
            <h2 className="font-display text-base font-bold">{t("consent.privacy_title")}</h2>
          </div>
          <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground">{t("consent.privacy_desc")}</p>
        </div>

        {/* Дисклеймер */}
        <div className="rounded-3xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-amber-500/15 text-amber-500">
              <AlertTriangle className="size-5" />
            </span>
            <h2 className="font-display text-base font-bold">{t("consent.disclaimer_title")}</h2>
          </div>
          <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground">{t("consent.disclaimer_desc")}</p>
        </div>

        {/* Чекбоксы */}
        <div className="space-y-2.5">
          <CheckboxRow checked={cb1} onChange={setCb1} label={t("consent.cb1")} />
          <CheckboxRow checked={cb2} onChange={setCb2} label={t("consent.cb2")} />
        </div>

        <button
          type="button"
          disabled={!ready}
          onClick={onAccept}
          className="w-full rounded-2xl bg-gradient-to-r from-[#ffd700] to-[#ff9d00] py-3.5 text-sm font-bold text-black shadow-[0_10px_30px_-10px_rgba(255,215,0,0.7)] transition-transform active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
        >
          {t("consent.accept")}
        </button>

        {!ready && (
          <p className="text-center text-[11px] text-muted-foreground">{t("consent.agree_all")}</p>
        )}

        <p className="text-center text-[10px] text-muted-foreground/70">
          {t("consent.version", { version: CONSENT_VERSION })}
        </p>
      </div>
    </div>
  )
}

function CheckboxRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-2xl border border-border bg-card p-3.5 text-left transition-colors active:bg-secondary/50"
    >
      <span
        className={cn(
          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-all",
          checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 bg-transparent",
        )}
      >
        {checked && <Check className="size-3.5" />}
      </span>
      <span className="text-[13px] leading-snug text-foreground">{label}</span>
    </button>
  )
}
