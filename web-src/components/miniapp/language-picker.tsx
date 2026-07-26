"use client"

import { useState, useMemo } from "react"
import { Globe, X, Check, Search } from "lucide-react"
import { useI18n, LANGUAGES } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export function LanguagePicker({ onClose }: { onClose: () => void }) {
  const { lang, setLang, t } = useI18n()
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return LANGUAGES
    return LANGUAGES.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.nativeName.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q),
    )
  }, [query])

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center">
      <button
        type="button"
        aria-label={t("common.close")}
        onClick={onClose}
        className="absolute inset-0 bg-background/70 backdrop-blur-sm animate-rise"
      />
      <div className="relative mx-auto w-full max-w-md rounded-t-3xl border-t border-border bg-card pb-8 animate-rise max-h-[80vh] flex flex-col">
        <div className="mx-auto mb-4 mt-3 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/40" />

        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 grid size-8 place-items-center rounded-lg text-muted-foreground active:bg-secondary"
          aria-label={t("common.close")}
        >
          <X className="size-4" />
        </button>

        <h2 className="px-5 pb-2 pt-2 font-display text-lg font-bold">{t("lang.title")}</h2>

        <div className="px-5 pb-3">
          <div className="flex items-center gap-2 rounded-2xl border border-input bg-background px-3 py-2.5">
            <Search className="size-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("lang.search")}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-2">
          <ul className="space-y-1">
            {filtered.map((l) => {
              const isActive = l.code === lang
              return (
                <li key={l.code}>
                  <button
                    type="button"
                    onClick={() => {
                      setLang(l.code)
                      onClose()
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors active:scale-[0.99]",
                      isActive ? "bg-primary/10" : "hover:bg-secondary",
                    )}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-sm font-bold uppercase">
                      {l.code.slice(0, 2)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{l.nativeName}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{l.name}</p>
                    </div>
                    {isActive && (
                      <Check className="size-5 shrink-0 text-primary" />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
