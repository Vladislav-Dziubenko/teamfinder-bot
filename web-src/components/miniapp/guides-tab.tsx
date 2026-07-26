"use client"

import { useState, useEffect } from "react"
import { Play, Eye, Clock, X, ThumbsUp, Bookmark, Loader2 } from "lucide-react"
import { games } from "@/lib/data"
import { api, openLink } from "@/lib/api"
import { cn } from "@/lib/utils"

const filters = ["all", "CS2", "Dota", "Valorant", "PUBG"] as const

interface ApiGuide {
  id: string; game: string; title: string; type: string; stars: number; unlocked: boolean; video_url?: string
}

const GAME_COVERS: Record<string, string> = {
  cs2: "/guide-cs2.png", dota2: "/guide-moba.png", valorant: "/guide-moba.png",
  pubg: "/guide-br.png", apex: "/guide-br.png", fortnite: "/guide-br.png",
  minecraft: "/guide-moba.png", roblox: "/guide-moba.png", wot: "/guide-br.png",
  wt: "/guide-br.png", rust: "/guide-br.png",
}

function toDisplay(g: ApiGuide) {
  const label = g.type === "free" ? "Бесплатно" : g.type === "premium" ? `⭐${g.stars}` : "Видео"
  return { id: g.id, title: g.title, game: g.game, cover: GAME_COVERS[g.game] || "/guide-moba.png", author: "Nexus Team", duration: "8:30", views: g.type === "free" ? "1.2K" : "850", type: label, level: g.type === "free" ? "Новичок" : "Продвинутый", video_url: g.video_url }
}

export function GuidesTab() {
  const [active, setActive] = useState("all")
  const [open, setOpen] = useState<ReturnType<typeof toDisplay> | null>(null)
  const [guides, setGuides] = useState<ApiGuide[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function load() {
    setLoading(true); setError(null)
    api.get("/api/guides").then((d) => { setGuides(d.guides || []); setLoading(false) }).catch((e) => { setError(e.message || "Ошибка"); setLoading(false) })
  }
  useEffect(() => { load() }, [])

  const list = guides.map(toDisplay).filter((g) => { if (active === "all") return true; const gm = games.find((x) => x.id === g.game); return gm?.short === active })
  const featured = list[0]

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>
  if (error) return <div className="px-4 py-20 text-center"><p className="text-muted-foreground">{error}</p><button type="button" onClick={load} className="mt-4 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground">Повторить</button></div>
  if (list.length === 0) return <div className="px-4 py-20 text-center"><p className="text-muted-foreground">Нет гайдов</p></div>

  return (
    <div className="space-y-5 px-4 py-5">
      <div><h1 className="font-display text-2xl font-bold">Гайды и разборы</h1><p className="text-sm text-muted-foreground">Смотри прямо в приложении</p></div>
      <button type="button" onClick={() => setOpen(featured)} className="animate-rise relative block w-full overflow-hidden rounded-3xl border border-border text-left">
        <img src={featured.cover || "/placeholder.svg"} alt="" className="h-48 w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
        <span className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground">🔥 Топ недели</span>
        <span className="absolute right-4 top-4 grid size-12 place-items-center rounded-full bg-primary/90 text-primary-foreground animate-float"><Play className="size-5 translate-x-0.5 fill-primary-foreground" /></span>
        <div className="absolute inset-x-0 bottom-0 p-4">
          <h2 className="font-display text-xl font-bold leading-tight text-balance">{featured.title}</h2>
          <p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span>{featured.author}</span><span className="flex items-center gap-1"><Eye className="size-3" />{featured.views}</span><span className="flex items-center gap-1"><Clock className="size-3" />{featured.duration}</span>
          </p>
        </div>
      </button>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {filters.map((f) => (
          <button key={f} type="button" onClick={() => setActive(f)} className={cn("shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors", active === f ? "border-primary bg-primary/15 text-primary" : "border-border bg-card text-muted-foreground")}>
            {f === "all" ? "Все" : f}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {list.map((g, i) => {
          const gm = games.find((x) => x.id === g.game)
          return (
            <button key={g.id} type="button" onClick={() => setOpen(g)} className="animate-rise flex w-full gap-3 rounded-2xl border border-border bg-card p-2.5 text-left" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-xl">
                <img src={g.cover || "/placeholder.svg"} alt="" className="size-full object-cover" />
                <span className="absolute inset-0 grid place-items-center bg-background/30"><Play className="size-6 fill-foreground/90 text-foreground/90" /></span>
                <span className="absolute bottom-1 right-1 rounded bg-background/80 px-1 text-[10px] font-medium">{g.duration}</span>
              </div>
              <div className="min-w-0 flex-1 py-0.5">
                <div className="flex items-center gap-1.5"><span className="font-display text-xs font-bold" style={{ color: gm?.color }}>{gm?.short}</span><span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">{g.type}</span></div>
                <p className="mt-1 line-clamp-2 text-sm font-semibold leading-snug">{g.title}</p>
                <p className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">{g.author} · <Eye className="size-3" />{g.views}</p>
              </div>
            </button>
          )
        })}
      </div>
      {open && <GuideViewer guide={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function GuideViewer({ guide, onClose }: { guide: ReturnType<typeof toDisplay>; onClose: () => void }) {
  const [liked, setLiked] = useState(false); const [saved, setSaved] = useState(false)
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button type="button" aria-label="Закрыть" onClick={onClose} className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      <div className="relative mx-auto w-full max-w-md rounded-t-3xl border-t border-border bg-card pb-8 animate-rise">
        <div className="relative aspect-video overflow-hidden rounded-t-3xl">
          <img src={guide.cover || "/placeholder.svg"} alt="" className="size-full object-cover" />
          <button type="button" onClick={() => guide.video_url && openLink(guide.video_url)} className="absolute inset-0 grid place-items-center bg-background/40">
            <span className="grid size-16 place-items-center rounded-full bg-primary text-primary-foreground animate-pulse-ring"><Play className="size-7 translate-x-0.5 fill-primary-foreground" /></span>
          </button>
          <button type="button" onClick={onClose} className="absolute right-3 top-3 grid size-8 place-items-center rounded-lg bg-background/70 text-foreground backdrop-blur"><X className="size-4" /></button>
          <div className="absolute inset-x-3 bottom-3 flex items-center gap-2"><div className="h-1 flex-1 overflow-hidden rounded-full bg-foreground/25"><div className="h-full w-1/4 rounded-full bg-primary" /></div><span className="text-[10px] font-medium text-foreground/90">{guide.duration}</span></div>
        </div>
        <div className="p-5">
          <h2 className="font-display text-xl font-bold leading-tight text-balance">{guide.title}</h2>
          <p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground"><span>{guide.author}</span><span className="flex items-center gap-1"><Eye className="size-3" />{guide.views}</span><span className="rounded bg-secondary px-1.5 py-0.5">{guide.level}</span></p>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => setLiked((v) => !v)} className={cn("flex flex-1 items-center justify-center gap-2 rounded-2xl border py-3 text-sm font-semibold transition-colors", liked ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground")}><ThumbsUp className={cn("size-4", liked && "fill-primary")} /> Полезно</button>
            <button type="button" onClick={() => setSaved((v) => !v)} className={cn("flex flex-1 items-center justify-center gap-2 rounded-2xl border py-3 text-sm font-semibold transition-colors", saved ? "border-accent bg-accent/15 text-accent" : "border-border text-muted-foreground")}><Bookmark className={cn("size-4", saved && "fill-accent")} /> Сохранить</button>
          </div>
        </div>
      </div>
    </div>
  )
}
