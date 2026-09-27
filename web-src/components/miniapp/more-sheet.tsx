"use client"

import { useEffect, useMemo } from "react"
import { ChevronRight } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { useNexus } from "@/lib/store"
import { MORE_TABS, type TabId } from "./bottom-nav"
import { hapticTap } from "@/lib/webapp"
import { BottomSheet } from "./bottom-sheet"

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
  const { role } = useNexus()
  // Developer Analytics не показываем обычным пользователям.
  // Сервер всё равно проверяет права на каждый запрос.
  const tabs = useMemo(
    () => MORE_TABS.filter((tb) => tb.id !== "analytics" || role === "developer"),
    [role],
  )

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
    >
      <div className="px-2">
        {tabs.map(({ id, labelKey, icon: Icon }) => {
          const isActive = active === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                hapticTap()
                onSelect(id)
                onClose()
              }}
              className="nexus-more-row"
              data-active={isActive}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="size-5 shrink-0 text-primary" />
              <span className="flex-1 text-sm font-medium leading-tight">{t(labelKey)}</span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          )
        })}
      </div>
    </BottomSheet>
  )
}
