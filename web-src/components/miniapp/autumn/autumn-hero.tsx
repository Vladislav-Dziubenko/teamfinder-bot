"use client"

import { useEffect, useState } from "react"
import { ChevronRight, Hourglass } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { getAutumnRemaining } from "./autumn-event"

function pad(n: number) {
  return String(n).padStart(2, "0")
}

export function AutumnHero({ onExplore }: { onExplore: () => void }) {
  const { t } = useI18n()
  // Секундный тикер — как в cases-tab/battlepass-tab.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const left = getAutumnRemaining()

  return (
    <section className="animate-rise relative overflow-hidden rounded-3xl border border-primary/30">
      <img src="/autumn-hero.webp" alt="" className="h-48 w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-background/10" />
      <div className="absolute inset-x-0 bottom-0 p-5">
        <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
          <Hourglass className="size-3" /> {t("event.season_label")}
        </span>
        <h1 className="font-display text-3xl font-bold leading-none text-glow-primary">NEXUS AUTUMN</h1>
        <p className="mt-1.5 max-w-[16rem] text-sm text-muted-foreground text-pretty">
          {t("event.subtitle")}
        </p>

        {left.ended ? (
          <p className="mt-3 inline-flex rounded-2xl bg-secondary px-4 py-2 text-sm font-bold text-muted-foreground">
            {t("event.ended")}
          </p>
        ) : (
          <div className="mt-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                {t("event.ends_in")}
              </p>
              <p className="mt-0.5 font-display text-2xl font-bold tabular-nums leading-none">
                {pad(left.days)}
                <span className="text-sm text-muted-foreground"> {t("event.days")} </span>
                {pad(left.hours)}:{pad(left.mins)}:{pad(left.secs)}
              </p>
            </div>
            <button
              type="button"
              onClick={onExplore}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)] transition-transform active:scale-95"
            >
              {t("event.explore")} <ChevronRight className="size-4" />
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
