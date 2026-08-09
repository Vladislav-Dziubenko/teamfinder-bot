"use client"

import { useState, useEffect } from "react"
import { Play, Clock, X, ExternalLink, Loader2 } from "lucide-react"
import { games } from "@/lib/data"
import { api } from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

interface ApiGuide {
  id: string
  game: string
  title: string
  type: string
  stars: number
  unlocked: boolean
  video_url?: string
}

const GAME_COVERS: Record<string, string> = {
  cs2: "/guide-cs2.webp",
  dota2: "/guide-moba.webp",
  valorant: "/guide-moba.webp",
  pubg: "/guide-br.webp",
  apex: "/guide-br.webp",
  fortnite: "/guide-br.webp",
  minecraft: "/guide-moba.webp",
  roblox: "/guide-moba.webp",
  wot: "/guide-br.webp",
  wt: "/guide-br.webp",
  rust: "/guide-br.webp",
}

function getYouTubeId(url?: string): string | null {
  if (!url) return null
  const m =
    url.match(/[?&]v=([^&]+)/) ||
    url.match(/youtu\.be\/([^?]+)/) ||
    url.match(/embed\/([^?]+)/)
  return m ? m[1] : null
}

function ytThumb(id: string) {
  return `https://img.youtube.com/vi/${id}/mqdefault.jpg`
}

function openYouTube(url?: string) {
  if (!url) return
  const tg = (window as any).Telegram?.WebApp
  if (tg?.openLink) {
    tg.openLink(url)
  } else {
    window.open(url, "_blank")
  }
}

interface DisplayGuide {
  id: string
  title: string
  game: string
  cover: string
  ytId: string | null
  video_url?: string
  duration: string
  views: string
}

function toDisplay(g: ApiGuide): DisplayGuide {
  const ytId = getYouTubeId(g.video_url)
  const cover = ytId ? ytThumb(ytId) : (GAME_COVERS[g.game] || "/guide-moba.webp")
  return {
    id: g.id,
    title: g.title,
    game: g.game,
    cover,
    ytId,
    video_url: g.video_url,
    duration: "—",
    views: "—",
  }
}

const GAME_FILTERS = [
  { id: "all", label: "guides.filter_all" },
  { id: "cs2", label: "CS2" },
  { id: "wot", label: "WoT" },
  { id: "wt", label: "War Thunder" },
  { id: "roblox", label: "Roblox" },
]

export function GuidesTab() {
  const { t } = useI18n()
  const [activeFilter, setActiveFilter] = useState("all")
  const [open, setOpen] = useState<DisplayGuide | null>(null)
  const [guides, setGuides] = useState<ApiGuide[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function load() {
    setLoading(true)
    setError(null)
    api
      .get("/api/guides")
      .then((d) => {
        setGuides(d.guides || [])
        setLoading(false)
      })
      .catch((e) => {
        setError(e.message || t("common.error"))
        setLoading(false)
      })
  }

  useEffect(() => {
    load()
  }, [])

  const list = guides
    .map(toDisplay)
    .filter((g) => activeFilter === "all" || g.game === activeFilter)

  const featured = list[0]

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )

  if (error)
    return (
      <div className="px-4 py-20 text-center">
        <p className="text-muted-foreground">{error}</p>
        <button
          type="button"
          onClick={load}
          className="mt-4 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground"
        >
          {t("common.retry")}
        </button>
      </div>
    )

  if (list.length === 0)
    return (
      <div className="px-4 py-20 text-center">
        <p className="text-muted-foreground">{t("guides.empty")}</p>
      </div>
    )

  return (
    <div className="space-y-5 px-4 py-5">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold">{t("guides.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("guides.subtitle")}</p>
      </div>

      {/* Featured */}
      {featured && (
        <button
          type="button"
          onClick={() => setOpen(featured)}
          className="animate-rise relative block w-full overflow-hidden rounded-3xl border border-border text-left"
        >
          <img
            src={featured.cover || "/placeholder.svg"}
            alt=""
            className="h-48 w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
          <span className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground">
            {t("guides.featured")}
          </span>
          <span className="absolute right-4 top-4 grid size-12 place-items-center rounded-full bg-primary/90 text-primary-foreground animate-float">
            <Play className="size-5 translate-x-0.5 fill-primary-foreground" />
          </span>
          <div className="absolute inset-x-0 bottom-0 p-4">
            <h2 className="font-display text-xl font-bold leading-tight text-balance">
              {featured.title}
            </h2>
            <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Play className="size-3" /> YouTube
              </span>
            </p>
          </div>
        </button>
      )}

      {/* Filters */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {GAME_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setActiveFilter(f.id)}
            className={cn(
              "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
              activeFilter === f.id
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-card text-muted-foreground"
            )}
          >
            {f.id === "all" ? t(f.label) : f.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-3">
        {list.map((g, i) => {
          const gm = games.find((x) => x.id === g.game)
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => setOpen(g)}
              className="animate-rise flex w-full gap-3 rounded-2xl border border-border bg-card p-2.5 text-left"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-xl bg-secondary">
                <img
                  src={g.cover || "/placeholder.svg"}
                  alt=""
                  className="size-full object-cover"
                />
                <span className="absolute inset-0 grid place-items-center bg-background/30">
                  <Play className="size-6 fill-foreground/90 text-foreground/90" />
                </span>
                {g.ytId && (
                  <span className="absolute bottom-1 left-1 rounded bg-red-600 px-1 py-0.5 text-[9px] font-bold text-white leading-none">
                    YT
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1 py-0.5">
                <div className="flex items-center gap-1.5">
                  <span
                    className="font-display text-xs font-bold"
                    style={{ color: gm?.color }}
                  >
                    {gm?.short}
                  </span>
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    Видео
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm font-semibold leading-snug">
                  {g.title}
                </p>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <ExternalLink className="size-3" /> Открыть в YouTube
                </p>
              </div>
            </button>
          )
        })}
      </div>

      {/* Viewer modal */}
      {open && <GuideViewer guide={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function GuideViewer({
  guide,
  onClose,
}: {
  guide: DisplayGuide
  onClose: () => void
}) {
  const { t } = useI18n()
  const gm = games.find((x) => x.id === guide.game)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <button
        type="button"
        aria-label={t("common.close")}
        onClick={onClose}
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
      />

      {/* Sheet */}
      <div className="relative mx-auto w-full max-w-md rounded-t-3xl border-t border-border bg-card pb-10 animate-rise">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 grid size-8 place-items-center rounded-lg bg-secondary text-muted-foreground"
        >
          <X className="size-4" />
        </button>

        {/* Thumbnail */}
        <div className="relative aspect-video overflow-hidden rounded-t-3xl bg-black">
          <img
            src={guide.cover || "/placeholder.svg"}
            alt={guide.title}
            className="size-full object-cover opacity-80"
          />
          {/* Play overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/40">
            <button
              type="button"
              onClick={() => openYouTube(guide.video_url)}
              className="grid size-16 place-items-center rounded-full bg-red-600 text-white shadow-lg transition-transform active:scale-95"
            >
              <Play className="size-7 translate-x-0.5 fill-white" />
            </button>
            <span className="rounded-full bg-background/70 px-3 py-1 text-xs font-medium text-foreground backdrop-blur">
              Открыть в YouTube
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="p-5">
          <div className="flex items-center gap-2 mb-2">
            {gm && (
              <span
                className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                style={{
                  color: gm.color,
                  background: `color-mix(in oklch, ${gm.color} 15%, transparent)`,
                }}
              >
                {gm.short}
              </span>
            )}
            <span className="rounded bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
              Видео
            </span>
          </div>

          <h2 className="font-display text-xl font-bold leading-tight text-balance">
            {guide.title}
          </h2>

          <button
            type="button"
            onClick={() => openYouTube(guide.video_url)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600 py-3.5 text-sm font-bold text-white shadow transition-transform active:scale-[0.98]"
          >
            <Play className="size-4 fill-white" />
            Смотреть на YouTube
          </button>
        </div>
      </div>
    </div>
  )
}
