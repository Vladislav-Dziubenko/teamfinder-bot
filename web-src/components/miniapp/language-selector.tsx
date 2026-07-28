"use client"

import { X, Search, Globe, Check } from "lucide-react"
import { LANGUAGES, useI18n, type LangCode } from "@/lib/i18n"
import { useState } from "react"
import { cn } from "@/lib/utils"

export function LanguageSelector({ onClose }: { onClose: () => void }) {
  const { lang, setLang, t } = useI18n()
  const [query, setQuery] = useState("")

  const filtered = LANGUAGES.filter((l) => {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      l.name.toLowerCase().includes(q) ||
      l.nativeName.toLowerCase().includes(q) ||
      l.code.toLowerCase().includes(q)
    )
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label={t("common.close")}
        onClick={onClose}
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
      />
      <div className="relative mx-auto max-h-[75dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border-t border-border bg-card pb-8">
        <div className="sticky top-0 z-10 border-b border-border bg-card">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="font-display text-xl font-bold">{t("lang.title")}</h2>
            <button
              type="button"
              onClick={onClose}
              className="grid size-8 place-items-center rounded-lg text-muted-foreground active:bg-secondary"
              aria-label={t("common.close")}
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="relative px-4 pb-3">
            <Search className="absolute left-7 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("lang.search")}
              className="w-full rounded-xl border border-input bg-secondary/60 py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/60"
              autoFocus
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Nothing found</p>
        ) : (
          <div className="px-2 pt-2">
            {filtered.map((l) => {
              const active = lang === l.code
              return (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => {
                    setLang(l.code)
                    onClose()
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors active:bg-secondary",
                    active ? "bg-primary/10" : "",
                  )}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary font-display text-sm font-bold uppercase text-muted-foreground">
                    {l.code.slice(0, 2)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{l.nativeName}</p>
                    <p className="text-xs text-muted-foreground">{l.name}</p>
                  </div>
                  {active && (
                    <span className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3.5" />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
