"use client"

import { KeyRound } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { useNexus } from "@/lib/store"

export function AutumnKeys() {
  const { t } = useI18n()
  const { inventory } = useNexus()
  const keys = inventory.filter((i) => i.key === "autumn-key").length
  const filled = Math.min(3, keys)

  return (
    <section className="rounded-3xl border border-stars/30 bg-gradient-to-br from-stars/10 to-card p-4">
      <div className="flex items-start gap-2.5">
        <span className="grid size-9 shrink-0 rotate-45 place-items-center border border-stars/70 text-stars">
          <KeyRound className="size-4 -rotate-45" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-stars">
            {t("event.keys_kicker")}
          </p>
          <p className="font-display text-base font-bold leading-tight">Autumn Key</p>
        </div>
        <strong className="text-sm font-bold text-stars tabular-nums">0.5%</strong>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        {t("event.keys_hint")}
      </p>
      <div className="mt-3 flex gap-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={
              i < filled
                ? "grid h-9 flex-1 place-items-center border border-stars bg-stars/10 text-sm font-bold text-stars"
                : "grid h-9 flex-1 place-items-center border border-dashed border-border text-xs text-muted-foreground"
            }
          >
            {i < filled ? "K" : "—"}
          </span>
        ))}
      </div>
      <p className="mt-2 text-center text-[11px] font-bold text-muted-foreground tabular-nums">
        {filled} / 3{keys > 3 ? ` (${t("event.keys_extra", { n: keys - 3 })})` : ""}
      </p>
    </section>
  )
}
