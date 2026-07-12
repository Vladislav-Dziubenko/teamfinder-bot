"use client"

import { useEffect, useState } from "react"
import { Play, Lock, X, Star } from "lucide-react"
import { api, payWithStars, type GamesResponse, type GuideItem, type GuideDetail } from "@/lib/api"
import { gameColor } from "@/lib/data"
import { cn } from "@/lib/utils"

export function GuidesTab({ games, onToast }: { games: GamesResponse; onToast: (msg: string) => void }) {
  const gameIds = Object.keys(games.games)
  const [activeGame, setActiveGame] = useState<string>(gameIds[0])
  const [list, setList] = useState<GuideItem[] | null>(null)
  const [open, setOpen] = useState<GuideDetail | null>(null)

  useEffect(() => {
    setList(null)
    api
      .guides(activeGame)
      .then((r) => setList(r.guides))
      .catch(() => setList([]))
  }, [activeGame])

  async function openGuide(id: string) {
    const guide = await api.guide(id)
    setOpen(guide)
  }

  async function buyGuide(guide: GuideDetail) {
    await payWithStars({ type: "guide", guide_id: guide.id }, async () => {
      const fresh = await api.guide(guide.id)
      setOpen(fresh)
      onToast("Гайд открыт!")
    })
  }

  return (
    <div className="space-y-5 px-4 py-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Гайды и разборы</h1>
        <p className="text-sm text-muted-foreground">Бесплатные и премиум за ⭐ Stars</p>
      </div>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {gameIds.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveGame(id)}
            className={cn(
              "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
              activeGame === id
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-card text-muted-foreground",
            )}
          >
            {games.games[id].emoji} {games.games[id].title}
          </button>
        ))}
      </div>

      {list === null && <p className="text-sm text-muted-foreground">Загрузка…</p>}
      {list && list.length === 0 && <p className="text-sm text-muted-foreground">Гайдов пока нет</p>}

      <div className="space-y-3">
        {list?.map((g, i) => (
          <button
            key={g.id}
            type="button"
            onClick={() => openGuide(g.id)}
            className="animate-rise flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div
              className="grid size-14 shrink-0 place-items-center rounded-xl"
              style={{ backgroundColor: "color-mix(in srgb, var(--primary) 12%, transparent)" }}
            >
              {g.unlocked ? (
                <Play className="size-5 fill-primary text-primary" />
              ) : (
                <Lock className="size-5 text-stars" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {g.type === "video" ? "Видео" : g.type === "premium" ? "Премиум" : "Бесплатно"}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm font-semibold leading-snug">{g.title}</p>
              {!g.unlocked && <p className="mt-0.5 text-[11px] text-stars">{g.stars}⭐ за полную версию</p>}
            </div>
          </button>
        ))}
      </div>

      {open && (
        <GuideViewer guide={open} onClose={() => setOpen(null)} onBuy={() => buyGuide(open)} />
      )}
    </div>
  )
}

function GuideViewer({
  guide,
  onClose,
  onBuy,
}: {
  guide: GuideDetail
  onClose: () => void
  onBuy: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
      />
      <div className="relative mx-auto w-full max-w-md rounded-t-3xl border-t border-border bg-card pb-8 animate-rise">
        <div className="flex items-center justify-between p-5 pb-0">
          <h2 className="font-display text-xl font-bold leading-tight text-balance">{guide.title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-foreground"
            aria-label="Закрыть"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-5">
          {guide.unlocked ? (
            <div
              className="prose prose-invert max-w-none text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: guide.text || "" }}
            />
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{guide.preview}…</p>
              <div className="rounded-2xl border border-stars/30 bg-stars/10 p-4">
                <p className="font-display text-sm font-bold text-stars">Полная версия за {guide.stars}⭐</p>
                <button
                  type="button"
                  onClick={onBuy}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-stars py-3 text-sm font-bold text-background"
                >
                  <Star className="size-4 fill-background" /> Купить и открыть
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
