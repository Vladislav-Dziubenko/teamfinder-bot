"use client"

import { useState } from "react"
import { X, Share2, Download, Loader2, Sparkles } from "lucide-react"
import { generateStoryCard } from "@/lib/share-card"
import { useNexus } from "@/lib/store"
import { useI18n } from "@/lib/i18n"

export function ShareStorySheet({
  open,
  onClose,
  refCode,
  botUsername,
}: {
  open: boolean
  onClose: () => void
  refCode: string
  botUsername: string
}) {
  const { t } = useI18n()
  const { me, nick } = useNexus() as any
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  if (!open) return null

  async function makeCard(): Promise<Blob> {
    const blob = await generateStoryCard({
      refCode: refCode || "REF",
      botUsername: botUsername || "teamfinder_bot",
      userNick: nick || me?.nick || "Игрок NEXUS",
      userAvatar: me?.avatar ?? null,
      stats: { wins: me?.wins ?? 0, level: me?.level ?? "—" },
    })
    return blob
  }

  async function onShare() {
    setBusy(true)
    try {
      const blob = await makeCard()
      const file = new File([blob], "nexus-story.png", { type: "image/png" })
      const url = URL.createObjectURL(blob)
      setPreview(url)
      // Telegram story API (Bot 7.8) — если доступен, шарим прямо в сторис
      const wa: any = (window as any).Telegram?.WebApp
      if (wa?.shareToStory) {
        try {
          wa.shareToStory(url, { text: `Играй со мной в NEXUS TeamHub! t.me/${botUsername}?start=${refCode}`, widget_link: { url: `https://t.me/${botUsername}?start=${refCode}` } })
          return
        } catch {}
      }
      if ((navigator as any).share && (navigator as any).canShare?.({ files: [file] })) {
        await (navigator as any).share({ files: [file], title: "NEXUS TeamHub", text: `Играй со мной! t.me/${botUsername}?start=${refCode}` })
      } else {
        // fallback download
        const a = document.createElement("a")
        a.href = url
        a.download = "nexus-story.png"
        a.click()
      }
    } finally {
      setBusy(false)
    }
  }

  async function onDownload() {
    setBusy(true)
    try {
      const blob = await makeCard()
      const url = URL.createObjectURL(blob)
      setPreview(url)
      const a = document.createElement("a")
      a.href = url
      a.download = "nexus-story.png"
      a.click()
    } finally {
      setBusy(false)
    }
  }

  async function onPreview() {
    setBusy(true)
    try {
      const blob = await makeCard()
      setPreview(URL.createObjectURL(blob))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center">
      <button aria-label="close" onClick={onClose} className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
      <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-t-3xl border-t border-border bg-card">
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 className="font-display flex items-center gap-2 text-lg font-bold">
            <Sparkles className="size-5 text-primary" /> Поделись в сторис
          </h2>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-lg text-muted-foreground active:bg-secondary">
            <X className="size-4" />
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-muted-foreground">Карточка 1080×1920 с твоим QR. Друг сканирует → /start → ты +30⭐.</p>
          {preview && (
            <img src={preview} alt="preview" className="mx-auto mt-4 max-h-[320px] rounded-2xl border border-border object-contain" />
          )}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <button disabled={busy} onClick={onPreview} className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-secondary py-3 text-sm font-bold disabled:opacity-50">
              {busy ? <Loader2 className="size-4 animate-spin" /> : null} Превью
            </button>
            <button disabled={busy} onClick={onDownload} className="flex items-center justify-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 py-3 text-sm font-bold text-primary disabled:opacity-50">
              <Download className="size-4" /> Скачать
            </button>
            <button disabled={busy} onClick={onShare} className="flex items-center justify-center gap-1.5 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">
              <Share2 className="size-4" /> Поделиться
            </button>
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">QR → t.me/{botUsername}?start={refCode}</p>
        </div>
      </div>
    </div>
  )
}
