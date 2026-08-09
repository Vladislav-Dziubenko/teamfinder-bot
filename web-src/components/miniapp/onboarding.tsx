"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Swords, Search, Trophy, Package, MessagesSquare, ChevronLeft, ChevronRight, Sparkles } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const ONBOARDING_KEY = "nexus.onboarding.v1"

type Slide = {
  key: string
  icon: typeof Swords
  glow: string
  from: string
}

const SLIDES: Slide[] = [
  { key: "welcome", icon: Sparkles, glow: "rgba(124,58,237,0.8)", from: "#7c3aed" },
  { key: "profile", icon: Swords, glow: "rgba(124,58,237,0.8)", from: "#7c3aed" },
  { key: "match", icon: Search, glow: "rgba(6,182,212,0.8)", from: "#06b6d4" },
  { key: "cases", icon: Package, glow: "rgba(245,158,11,0.8)", from: "#f59e0b" },
  { key: "chat", icon: MessagesSquare, glow: "rgba(16,185,129,0.8)", from: "#10b981" },
]

export function isOnboardingDone(): boolean {
  if (typeof window === "undefined") return true
  try {
    return localStorage.getItem(ONBOARDING_KEY) === "1"
  } catch {
    return true
  }
}

export function markOnboardingDone(): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, "1")
  } catch {}
}

export function OnboardingSheet({ onDone, onSkip }: { onDone: () => void; onSkip?: () => void }) {
  const { t } = useI18n()
  const [index, setIndex] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1)
  const [anim, setAnim] = useState<"in" | "out">("in")
  const touchX = useRef<number | null>(null)

  const total = SLIDES.length
  const last = index === total - 1
  const slide = SLIDES[index]

  const go = useCallback((next: number, d: 1 | -1) => {
    if (next < 0 || next >= total) return
    setDir(d)
    setAnim("out")
  }, [total])

  useEffect(() => {
    if (anim !== "out") return
    const id = setTimeout(() => {
      setIndex((i) => i + dir)
      setAnim("in")
    }, 140)
    return () => clearTimeout(id)
  }, [anim, dir])

  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return
    const dx = e.changedTouches[0].clientX - touchX.current
    touchX.current = null
    if (Math.abs(dx) < 48) return
    go(index + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1)
  }

  return (
    <div className="fixed inset-0 z-[125] flex flex-col bg-background">
      {/* Шапка */}
      <div className="relative shrink-0 overflow-hidden px-6 pb-8 pt-12">
        <div
          className="pointer-events-none absolute -top-16 left-1/2 h-52 w-80 -translate-x-1/2 rounded-full blur-3xl transition-colors duration-500"
          style={{ background: slide.glow }}
        />
        <div className="relative flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground backdrop-blur">
            <Sparkles className="size-3" />
            {t("onboarding.badge")}
          </span>
          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              className="rounded-full px-3 py-1 text-[11px] font-semibold text-muted-foreground transition-colors active:bg-muted"
            >
              {t("onboarding.skip")}
            </button>
          )}
        </div>
      </div>

      {/* Контент слайда — меняется плавно, без перерисовки всего экрана */}
      <div className="flex flex-1 flex-col" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="relative flex-1 px-6">
          <div
            key={slide.key}
            className={cn(
              "flex h-full flex-col items-center justify-center text-center transition-all duration-150 ease-out",
              anim === "in" ? "translate-x-0 opacity-100" : dir === 1 ? "-translate-x-6 opacity-0" : "translate-x-6 opacity-0",
            )}
          >
            <div
              className="grid size-24 place-items-center rounded-[28px] shadow-[0_16px_48px_-16px] transition-all duration-500"
              style={{
                backgroundImage: `linear-gradient(to bottom right, ${slide.from}, #0f172a)`,
                boxShadow: `0 16px 48px -16px ${slide.glow}`,
              }}
            >
              <slide.icon className="size-12 text-white" />
            </div>
            <h1 className="mt-6 font-display text-2xl font-bold text-balance">{t(`onboarding.${slide.key}_title`)}</h1>
            <p className="mx-auto mt-3 max-w-[19rem] text-sm leading-relaxed text-muted-foreground text-pretty">
              {t(`onboarding.${slide.key}_desc`)}
            </p>
            {slide.key === "match" && (
              <p className="mx-auto mt-4 max-w-[17rem] rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-[12px] leading-relaxed text-accent">
                {t("onboarding.match_tip")}
              </p>
            )}
            {slide.key === "chat" && (
              <p className="mx-auto mt-4 max-w-[17rem] rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-[12px] leading-relaxed text-emerald-500">
                {t("onboarding.chat_tip")}
              </p>
            )}
          </div>
        </div>

        {/* Точки-индикаторы */}
        <div className="flex items-center justify-center gap-1.5 pb-5">
          {SLIDES.map((s, i) => (
            <button
              key={s.key}
              type="button"
              aria-label={`${i + 1}/${total}`}
              onClick={() => go(i, i > index ? 1 : -1)}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === index ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/25 active:bg-muted-foreground/40",
              )}
            />
          ))}
        </div>
      </div>

      {/* Кнопки навигации */}
      <div className="shrink-0 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2">
          {index > 0 && (
            <button
              type="button"
              onClick={() => go(index - 1, -1)}
              aria-label={t("onboarding.back")}
              className="grid size-12 shrink-0 place-items-center rounded-2xl border border-border bg-card text-muted-foreground transition-transform active:scale-95"
            >
              <ChevronLeft className="size-5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => (last ? onDone() : go(index + 1, 1))}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold transition-transform active:scale-[0.98]",
              last
                ? "bg-gradient-to-r from-[#ffd700] to-[#ff9d00] text-black shadow-[0_10px_30px_-10px_rgba(255,215,0,0.7)]"
                : "bg-gradient-to-r from-primary to-accent text-white shadow-[0_10px_30px_-10px_rgba(124,58,237,0.7)]",
            )}
          >
            {last ? <Trophy className="size-4" /> : null}
            {t(last ? "onboarding.start" : "onboarding.next")}
            {!last && <ChevronRight className="size-4" />}
          </button>
        </div>
      </div>
    </div>
  )
}
