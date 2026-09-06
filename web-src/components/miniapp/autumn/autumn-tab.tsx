"use client"

import { useState } from "react"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { TabId } from "../bottom-nav"
import { AutumnHero } from "./autumn-hero"
import { AutumnCases } from "./autumn-cases"
import { AutumnKeys } from "./autumn-keys"
import { AutumnPass } from "./autumn-pass"
import { AutumnCollection } from "./autumn-collection"

type AutumnTab = "overview" | "cases" | "pass" | "collection"

const TABS: AutumnTab[] = ["overview", "cases", "pass", "collection"]

export function AutumnTab({
  onToast,
  onGo,
}: {
  onToast: (m: string) => void
  onGo: (t: TabId) => void
}) {
  const { t } = useI18n()
  const [tab, setTab] = useState<AutumnTab>("overview")

  return (
    <div className="space-y-5 px-4 py-5">
      <AutumnHero onExplore={() => setTab("cases")} />

      <nav className="-mx-4 overflow-x-auto no-scrollbar px-4" aria-label={t("event.title")}>
        <div className="flex gap-2">
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-xl border px-4 py-2 text-sm font-semibold transition-colors active:scale-95",
                tab === id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-secondary text-muted-foreground",
              )}
            >
              {t(`event.tab_${id}`)}
              {id === "cases" && (
                <span className="ml-1.5 rounded border border-current px-1 text-[9px] font-bold">
                  NEW
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {tab === "overview" && (
        <div className="space-y-5">
          <AutumnCases onToast={onToast} onGoCases={() => setTab("cases")} />
          <AutumnKeys />
          <AutumnPass onToast={onToast} onGoPass={() => onGo("battlepass")} />
        </div>
      )}
      {tab === "cases" && (
        <div className="space-y-5">
          <AutumnCases onToast={onToast} onGoCases={() => onGo("cases")} />
          <AutumnKeys />
        </div>
      )}
      {tab === "pass" && <AutumnPass onToast={onToast} onGoPass={() => onGo("battlepass")} />}
      {tab === "collection" && <AutumnCollection />}
    </div>
  )
}
