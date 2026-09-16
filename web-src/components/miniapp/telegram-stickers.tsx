"use client"

import { useEffect, useState } from "react"
import { Loader2, Plus, RefreshCw, X } from "lucide-react"
import { api } from "@/lib/api"
import { useI18n } from "@/lib/i18n"

type TelegramStickerData = {
  file_id: string
  thumb_file_id?: string
  emoji?: string
  is_animated?: boolean
  is_video?: boolean
}
type StickerSet = { name: string; title: string; stickers: TelegramStickerData[] }
const mediaUrl = (id: string) =>
  `${process.env.NEXT_PUBLIC_API_BASE || ""}/api/stickers/img/${encodeURIComponent(id)}`

function stickerMessage(pack: string, sticker: TelegramStickerData): string {
  const format = sticker.is_video ? "video" : sticker.is_animated ? "animated" : "static"
  return `tg_sticker:${pack}:${sticker.file_id}:${sticker.thumb_file_id || ""}:${format}`
}

export function TelegramSticker({ text, className = "" }: { text: string; className?: string }) {
  const [, , fileId, thumbnail, format] = text.trim().split(":")
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => { setFailed(false) }, [text, retry])
  if (failed || !fileId) {
    return <button type="button" className="rounded-xl bg-muted p-3 text-xs" onClick={(e) => {
      e.stopPropagation()
      setRetry((n) => n + 1)
    }}>Стикер не загрузился · Повторить</button>
  }
  // TGS is a vector animation, not an image. Telegram supplies its WebP
  // thumbnail so clients without a TGS player still display the actual sticker.
  const source = mediaUrl(format === "animated" && thumbnail ? thumbnail : fileId)
  if (format === "video") {
    return <video key={`${text}:${retry}`} src={source} poster={thumbnail ? mediaUrl(thumbnail) : undefined}
      autoPlay loop muted playsInline preload="metadata" aria-label="Стикер"
      className={className} onError={() => setFailed(true)} />
  }
  return <img key={`${text}:${retry}`} src={source} alt="Стикер" loading="lazy"
    className={className} onError={() => setFailed(true)} />
}

export function StickerPanel({ onPick, onClose }: { onPick: (sticker: string) => void; onClose: () => void }) {
  const { t } = useI18n()
  const [sets, setSets] = useState<StickerSet[]>([])
  const [selected, setSelected] = useState("")
  const [link, setLink] = useState("")
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState("")

  async function load() {
    setLoading(true)
    setError("")
    try {
      const data = await api.get<{ sets: StickerSet[] }>("/api/stickers")
      setSets(data.sets || [])
      setSelected((current) => data.sets.some((s) => s.name === current) ? current : data.sets[0]?.name || "")
    } catch {
      setError("Не удалось загрузить стикеры. Попробуйте ещё раз.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  async function importPack() {
    if (!link.trim() || importing) return
    setImporting(true)
    setError("")
    try {
      const data = await api.post("/api/stickers/import", { name: link.trim() })
      const pack = data.set as StickerSet
      setSets((current) => [...current.filter((s) => s.name !== pack.name), pack])
      setSelected(pack.name)
      setLink("")
    } catch (e: any) {
      setError(e.message === "timeout" ? "Telegram не ответил. Попробуйте ещё раз." : e.message || "Не удалось добавить набор.")
    } finally {
      setImporting(false)
    }
  }

  const active = sets.find((s) => s.name === selected)
  return <div className="border-t border-border bg-card/95 px-3 py-2 backdrop-blur-xl">
    <div className="mb-2 flex items-center justify-between">
      <p className="text-xs font-semibold">{t("chat.stickers_title")} · Telegram</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => void load()} disabled={loading} aria-label="Обновить стикеры"><RefreshCw className="size-4" /></button>
        <button type="button" onClick={onClose} aria-label={t("common.close")}><X className="size-5" /></button>
      </div>
    </div>
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void importPack() }}>
      <input value={link} onChange={(e) => setLink(e.target.value)} maxLength={200}
        placeholder="Ссылка t.me/addstickers/…" aria-label="Ссылка на набор стикеров"
        className="min-w-0 flex-1 rounded-xl bg-background px-3 py-2 text-xs" />
      <button type="submit" disabled={!link.trim() || importing} aria-label="Добавить набор"
        className="rounded-xl bg-primary px-3 text-primary-foreground disabled:opacity-40">
        {importing ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
      </button>
    </form>
    <p className="my-2 text-[10px] text-muted-foreground">В Telegram откройте набор → «Поделиться» → скопируйте ссылку сюда. Анимированные TGS-стикеры показываются как превью.</p>
    {error && <p role="alert" className="my-2 text-xs text-destructive">{error}</p>}
    {loading ? <div className="grid h-24 place-items-center"><Loader2 className="size-6 animate-spin" /></div> : <>
      <div className="mb-2 flex gap-2 overflow-x-auto">
        {sets.map((pack) => <button key={pack.name} type="button" onClick={() => setSelected(pack.name)}
          className={`shrink-0 rounded-xl px-3 py-2 text-xs ${pack.name === selected ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
          {pack.title}
        </button>)}
      </div>
      <div className="grid max-h-56 grid-cols-4 gap-2 overflow-y-auto overscroll-contain">
        {active?.stickers.map((sticker) => <button key={sticker.file_id} type="button"
          aria-label={sticker.emoji ? `Отправить стикер ${sticker.emoji}` : "Отправить стикер"}
          onClick={() => onPick(stickerMessage(active.name, sticker))}
          className="grid aspect-square place-items-center rounded-xl hover:bg-muted active:scale-95">
          <img src={mediaUrl(sticker.thumb_file_id || sticker.file_id)} alt={sticker.emoji || "Стикер"}
            loading="lazy" className="max-h-20 max-w-full object-contain" />
        </button>)}
      </div>
      {!sets.length && <p className="py-4 text-center text-xs text-muted-foreground">Наборов пока нет. Добавьте свой по ссылке из Telegram.</p>}
    </>}
  </div>
}
