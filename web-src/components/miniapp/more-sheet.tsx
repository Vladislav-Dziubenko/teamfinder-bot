"use client"

import { useEffect } from "react"
import { useI18n } from "@/lib/i18n"
import { MORE_TABS, type TabId } from "./bottom-nav"
import { hapticTap } from "@/lib/webapp"
import { BottomSheet } from "./bottom-sheet"
import { cn } from "@/lib/utils"

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

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t("more.title")}
      autoFitKey={active}
      headerExtra={
        <p className="px-5 pb-2 text-sm text-muted-foreground">{t("more.subtitle")}</p>
      }
    >
      <div className="grid grid-cols-2 content-start gap-2.5 px-2">
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
    </BottomSheet>
  )
}
