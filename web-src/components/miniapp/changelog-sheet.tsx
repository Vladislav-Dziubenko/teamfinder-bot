"use client"

import { useRef } from "react"
import { motion, type PanInfo } from "framer-motion"
import { X, Sparkles, Check, Package, Rocket } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { updates, CURRENT_VERSION, STORAGE_KEY } from "@/lib/changelog"
import { hapticTap } from "@/lib/webapp"

export function ChangelogSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lang } = useI18n()
  const sheetRef = useRef<HTMLDivElement>(null)

  function handleClose() {
    hapticTap()
    try {
      localStorage.setItem(STORAGE_KEY, CURRENT_VERSION)
    } catch {}
    onClose()
  }

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > 100 || info.velocity.y > 500) {
      handleClose()
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center">
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={handleClose}
      />

      {/* Sheet */}
      <motion.div
        ref={sheetRef}
        className="relative w-full max-w-md rounded-t-3xl border-t border-border bg-card pb-8 pt-2 shadow-2xl"
        style={{ maxHeight: "85vh" }}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 350 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.5 }}
        onDragEnd={handleDragEnd}
      >
        {/* Drag handle */}
        <div className="flex justify-center pb-2 pt-1">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-4">
          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-xl bg-primary/15">
              <Rocket className="size-4 text-primary" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold">{lang === "ru" ? "Что нового" : "What's New"}</h2>
              <p className="text-[11px] text-muted-foreground">
                {lang === "ru" ? "Последние обновления" : "Latest updates"}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="grid size-8 place-items-center rounded-xl text-muted-foreground hover:bg-secondary/50 active:scale-90"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Updates list */}
        <div className="overflow-y-auto px-5" style={{ maxHeight: "calc(85vh - 120px)" }}>
          <div className="space-y-4 pb-4">
            {updates.map((update, idx) => (
              <motion.div
                key={update.version}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.08, type: "spring", damping: 25, stiffness: 300 }}
                className="relative overflow-hidden rounded-2xl border border-border bg-background/50 p-4"
              >
                {/* Major badge glow */}
                {update.isMajor && (
                  <div className="absolute -right-6 -top-6 size-24 rounded-full bg-primary/10 blur-2xl" />
                )}

                {/* Header row */}
                <div className="relative mb-3 flex items-center gap-2">
                  {update.isMajor ? (
                    <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-bold text-primary">
                      <Sparkles className="size-3" />
                      v{update.version}
                    </span>
                  ) : (
                    <span className="rounded-full bg-secondary/80 px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
                      v{update.version}
                    </span>
                  )}
                  <span className="text-[11px] text-muted-foreground">{update.date}</span>
                </div>

                {/* Title */}
                <h3 className="relative mb-2.5 font-display text-base font-bold">
                  {update.title[lang as "en" | "ru"] || update.title.en}
                </h3>

                {/* Items */}
                <ul className="relative space-y-1.5">
                  {(update.items[lang as "en" | "ru"] || update.items.en).map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                {/* Current version indicator */}
                {update.version === CURRENT_VERSION && (
                  <div className="relative mt-3 flex items-center gap-1.5 text-[11px] font-medium text-primary">
                    <Package className="size-3" />
                    {lang === "ru" ? "Текущая версия" : "Current version"}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
