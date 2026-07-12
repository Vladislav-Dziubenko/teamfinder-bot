"use client"

import { useState } from "react"
import { X, Send, Lock, Star } from "lucide-react"
import type { MatchResult } from "@/lib/api"
import { payWithStars } from "@/lib/api"

export function ContactSheet({
  player,
  onClose,
  onToast,
}: {
  player: MatchResult | null
  onClose: () => void
  onToast: (msg: string) => void
}) {
  const [buying, setBuying] = useState(false)

  if (!player) return null

  async function buy() {
    setBuying(true)
    try {
      await payWithStars({ type: "best_team" }, () => {
        onToast("Готово! Обнови поиск, чтобы увидеть контакт")
        onClose()
      })
    } finally {
      setBuying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-background/70 backdrop-blur-sm animate-rise"
      />

      <div className="relative mx-auto w-full max-w-md rounded-t-3xl border-t border-border bg-card p-5 pb-8 animate-rise">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted-foreground/40" />

        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 grid size-8 place-items-center rounded-lg text-muted-foreground active:bg-secondary"
          aria-label="Закрыть"
        >
          <X className="size-4" />
        </button>

        <div className="flex items-center gap-3">
          <div className="grid size-14 place-items-center rounded-2xl bg-secondary font-display text-2xl font-bold text-muted-foreground">
            {player.nickname.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-display text-xl font-bold leading-tight">{player.nickname}</p>
            <p className="text-sm text-muted-foreground">
              {player.rank} · {player.role}
            </p>
          </div>
        </div>

        {player.contact ? (
          <a
            href={player.contact.startsWith("@") ? `https://t.me/${player.contact.slice(1)}` : undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex items-center justify-between rounded-2xl border border-accent/30 bg-accent/10 p-3 transition-transform active:scale-[0.98]"
          >
            <span className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-accent text-accent-foreground">
                <Send className="size-4" />
              </span>
              <span className="leading-tight">
                <span className="block text-sm font-semibold text-foreground">Контакт</span>
                <span className="block text-xs text-accent">{player.contact}</span>
              </span>
            </span>
          </a>
        ) : (
          <div className="mt-4 rounded-2xl border border-stars/30 bg-stars/10 p-4">
            <p className="flex items-center gap-2 font-display text-sm font-bold text-stars">
              <Lock className="size-4" /> Контакт скрыт
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Купи «Лучший подбор» за 5 Stars — откроются контакты всех совпадений
            </p>
            <button
              type="button"
              onClick={buy}
              disabled={buying}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-stars py-3 text-sm font-bold text-background disabled:opacity-60"
            >
              <Star className="size-4 fill-background" /> {buying ? "Открываем оплату…" : "Купить за 5 Stars"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
