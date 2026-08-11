"use client"

import { useEffect } from "react"
import { X } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { MORE_TABS, type TabId } from "./bottom-nav"
import { hapticTap } from "@/lib/webapp"

export function MoreSheet({
  open,
  active,
  onSelect,
  onClose,
}: {
  open: boolean
  active: TabId
  onSelect: (t: TabId) => void
  onClose: () => void
}) {
  const { t } = useI18n()

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end">
      <button
        type="button"
        aria-label={t("common.close")}
        onClick={onClose}
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
      />
      <div className="relative mx-auto w-full max-w-md rounded-t-3xl border-t border-border bg-card p-5 pb-8 animate-rise">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted-foreground/40" />
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 grid size-8 place-items-center rounded-lg text-muted-foreground active:bg-secondary"
          aria-label={t("common.close")}
        >
          <X className="size-4" />
        </button>
        <h3 className="mb-1 font-display text-lg font-bold">{t("more.title")}</h3>
        <p className="mb-4 text-sm text-muted-foreground">{t("more.subtitle")}</p>

        <div className="grid grid-cols-2 gap-2.5">
          {MORE_TABS.map(({ id, labelKey, descKey, icon: Icon }) => {
            const isActive = active === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  hapticTap()
                  onSelect(id)
                }}
                className={cn(
                  "flex flex-col items-start gap-2 rounded-2xl border p-3.5 text-left transition-all active:scale-[0.98]",
                  isActive
                    ? "border-primary/50 bg-primary/10"
                    : "border-border bg-secondary/40",
                )}
              >
                <span
                  className={cn(
                    "grid size-9 place-items-center rounded-xl",
                    isActive ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
                  )}
                >
                  <Icon className="size-5" />
                </span>
                <span className="text-sm font-bold leading-tight">{t(labelKey)}</span>
                <span className="text-[11px] leading-snug text-muted-foreground">{t(descKey)}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ")
}
