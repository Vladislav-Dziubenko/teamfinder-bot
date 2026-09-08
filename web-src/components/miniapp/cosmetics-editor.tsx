"use client"

import { useEffect, useRef, useState } from "react"
import { api, getInitDataUser } from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { setCachedCosmetics, type Cosmetics } from "@/lib/chat"
import { cn } from "@/lib/utils"

const EMPTY: Cosmetics = { nick_color: "", frame_color: "", card_bg: "", avatar_art: "" }
const PALETTE = ["#ffd700", "#ff6b6b", "#4ade80", "#38bdff", "#c084fc", "#ff9d00", "#f472b6", "#e8e8e8"]
const ART_SIZE = 128
const ART_MAX_LEN = 150_000

let _ownPromise: Promise<{ cosmetics: Cosmetics; is_beta: boolean }> | null = null
function fetchOwn(): Promise<{ cosmetics: Cosmetics; is_beta: boolean }> {
  if (!_ownPromise) {
    _ownPromise = api
      .get("/api/profile/cosmetics")
      .then((d: any) => ({ cosmetics: { ...EMPTY, ...((d?.cosmetics ?? {}) as Partial<Cosmetics>) }, is_beta: Boolean(d?.is_beta) }))
      .catch(() => ({ cosmetics: { ...EMPTY }, is_beta: false }))
  }
  return _ownPromise
}
export function refreshOwnCosmetics(): void {
  _ownPromise = null
}

export function useOwnCosmetics(): { data: Cosmetics; isBeta: boolean; loading: boolean; reload: () => void } {
  const [data, setData] = useState<Cosmetics>({ ...EMPTY })
  const [isBeta, setIsBeta] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let cancelled = false
    if (tick > 0) _ownPromise = null
    setLoading(true)
    fetchOwn()
      .then((r) => {
        if (cancelled) return
        setData(r.cosmetics)
        setIsBeta(r.is_beta)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tick])
  return { data, isBeta, loading, reload: () => setTick((x) => x + 1) }
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-muted-foreground">{label}</p>
      <div className="flex flex-wrap items-center gap-2">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(value === c ? "" : c)}
            aria-label={c}
            className={cn(
              "size-8 rounded-full border-2 transition-transform active:scale-90",
              value === c ? "border-primary scale-110" : "border-border",
            )}
            style={{ background: c }}
          />
        ))}
        <label
          className="relative grid size-8 place-items-center overflow-hidden rounded-full border-2 border-dashed border-muted-foreground/50 text-sm active:scale-90"
          title="Свой цвет"
        >
          <span className="pointer-events-none font-bold" style={{ color: value || undefined }}>+</span>
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#ffd700"}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-semibold text-muted-foreground active:scale-95"
          >
            Сброс
          </button>
        )}
      </div>
    </div>
  )
}

function ArtCanvas({ initial, onArt }: { initial: string; onArt: (art: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [color, setColor] = useState("#ffd700")
  const [size, setSize] = useState(6)
  const [eraser, setEraser] = useState(false)
  const [strokes, setStrokes] = useState<string[]>([])
  const drawing = useRef(false)
  const { lang } = useI18n()
  const ru = lang === "ru"

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || !initial) return
    const img = new Image()
    img.onload = () => {
      const ctx = cv.getContext("2d")
      if (!ctx) return
      ctx.clearRect(0, 0, cv.width, cv.height)
      ctx.drawImage(img, 0, 0, cv.width, cv.height)
    }
    img.src = initial
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pos(e: React.PointerEvent): { x: number; y: number } | null {
    const cv = canvasRef.current
    if (!cv) return null
    const r = cv.getBoundingClientRect()
    return {
      x: ((e.clientX - r.left) / r.width) * cv.width,
      y: ((e.clientY - r.top) / r.height) * cv.height,
    }
  }

  function snapshot(): void {
    const cv = canvasRef.current
    if (!cv) return
    try {
      setStrokes((prev) => [...prev.slice(-24), cv.toDataURL("image/png")])
    } catch {}
  }

  function emit(): void {
    const cv = canvasRef.current
    if (!cv) return
    let out = ""
    try {
      out = cv.toDataURL("image/png")
      if (out.length > ART_MAX_LEN) {
        // Не влезло — сплющиваем на белый фон в JPEG.
        const flat = document.createElement("canvas")
        flat.width = cv.width
        flat.height = cv.height
        const fctx = flat.getContext("2d")
        if (!fctx) return
        fctx.fillStyle = "#ffffff"
        fctx.fillRect(0, 0, flat.width, flat.height)
        fctx.drawImage(cv, 0, 0)
        out = flat.toDataURL("image/jpeg", 0.85)
      }
    } catch {
      return
    }
    if (out.length <= ART_MAX_LEN) onArt(out)
  }

  function down(e: React.PointerEvent): void {
    e.preventDefault()
    const cv = canvasRef.current
    const p = pos(e)
    if (!cv || !p) return
    try {
      cv.setPointerCapture(e.pointerId)
    } catch {}
    snapshot()
    drawing.current = true
    const ctx = cv.getContext("2d")
    if (!ctx) return
    ctx.globalCompositeOperation = eraser ? "destination-out" : "source-over"
    ctx.strokeStyle = color
    ctx.lineWidth = size
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(p.x + 0.01, p.y + 0.01)
    ctx.stroke()
  }

  function move(e: React.PointerEvent): void {
    if (!drawing.current) return
    e.preventDefault()
    const cv = canvasRef.current
    const p = pos(e)
    if (!cv || !p) return
    const ctx = cv.getContext("2d")
    if (!ctx) return
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }

  function up(): void {
    if (!drawing.current) return
    drawing.current = false
    emit()
  }

  function undo(): void {
    const cv = canvasRef.current
    if (!cv || !strokes.length) return
    const prev = strokes[strokes.length - 1]
    setStrokes((s) => s.slice(0, -1))
    const img = new Image()
    img.onload = () => {
      const ctx = cv.getContext("2d")
      if (!ctx) return
      ctx.globalCompositeOperation = "source-over"
      ctx.clearRect(0, 0, cv.width, cv.height)
      ctx.drawImage(img, 0, 0, cv.width, cv.height)
      emit()
    }
    img.src = prev
  }

  function clear(): void {
    const cv = canvasRef.current
    if (!cv) return
    snapshot()
    const ctx = cv.getContext("2d")
    ctx?.clearRect(0, 0, cv.width, cv.height)
    emit()
  }

  return (
    <div>
      <div className="flex items-start gap-3">
        <div
          className="rounded-3xl border border-border"
          style={{
            backgroundImage:
              "linear-gradient(45deg, var(--muted) 25%, transparent 25%), linear-gradient(-45deg, var(--muted) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--muted) 75%), linear-gradient(-45deg, transparent 75%, var(--muted) 75%)",
            backgroundSize: "16px 16px",
            backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
          }}
        >
          <canvas
            ref={canvasRef}
            width={ART_SIZE}
            height={ART_SIZE}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onPointerLeave={up}
            className="block size-40 touch-none rounded-3xl"
          />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {["#ffd700", "#ff6b6b", "#4ade80", "#38bdff", "#c084fc", "#ffffff", "#111111"].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setColor(c)
                  setEraser(false)
                }}
                aria-label={c}
                className={cn(
                  "size-7 rounded-full border-2 transition-transform active:scale-90",
                  !eraser && color === c ? "border-primary scale-110" : "border-border",
                )}
                style={{ background: c }}
              />
            ))}
            <label className="relative grid size-7 place-items-center overflow-hidden rounded-full border-2 border-dashed border-muted-foreground/50 text-xs" title="Свой цвет">
              <span className="pointer-events-none font-bold">+</span>
              <input
                type="color"
                value={color}
                onChange={(e) => {
                  setColor(e.target.value)
                  setEraser(false)
                }}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">{ru ? "Кисть" : "Brush"}</span>
            <input type="range" min={2} max={16} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-full accent-[var(--primary)]" />
            <span className="w-6 text-right text-[11px] text-muted-foreground">{size}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEraser((v) => !v)}
              className={cn(
                "rounded-lg px-2 py-1.5 text-xs font-semibold active:scale-95",
                eraser ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
              )}
            >
              {ru ? "Ластик" : "Eraser"}
            </button>
            <button
              type="button"
              onClick={undo}
              disabled={!strokes.length}
              className="rounded-lg bg-secondary px-2 py-1.5 text-xs font-semibold text-muted-foreground active:scale-95 disabled:opacity-40"
            >
              ↩
            </button>
            <button
              type="button"
              onClick={clear}
              className="rounded-lg bg-secondary px-2 py-1.5 text-xs font-semibold text-muted-foreground active:scale-95"
            >
              {ru ? "Очистить" : "Clear"}
            </button>
          </div>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {ru ? "Рисуй прямо на холсте — сохраняется автоматически. Круглый кроп — как в чате." : "Draw on the canvas — autosaves. Circular crop as in chat."}
      </p>
    </div>
  )
}

export function CosmeticsEditor({ onToast, nick, avatar }: { onToast: (m: string) => void; nick: string; avatar: string | null }) {
  const { lang } = useI18n()
  const ru = lang === "ru"
  const { data, isBeta, loading, reload } = useOwnCosmetics()
  const [nickColor, setNickColor] = useState("")
  const [frameColor, setFrameColor] = useState("")
  const [cardBg, setCardBg] = useState("")
  const [art, setArt] = useState("")
  const [saving, setSaving] = useState(false)
  const [synced, setSynced] = useState(false)

  useEffect(() => {
    if (!loading && !synced) {
      setNickColor(data.nick_color || "")
      setFrameColor(data.frame_color || "")
      setCardBg(data.card_bg || "")
      setArt(data.avatar_art || "")
      setSynced(true)
    }
  }, [loading, data, synced])

  if (loading) {
    return (
      <section className="rounded-3xl border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">{ru ? "Загрузка оформления…" : "Loading style…"}</p>
      </section>
    )
  }

  if (!isBeta) {
    return (
      <section className="rounded-3xl border border-dashed border-border bg-card/60 p-5">
        <p className="font-display text-base font-bold">🎨 {ru ? "Своё оформление" : "Custom style"}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {ru ? "Цвет ника, рамки сообщений, фон карточки и рисованная аватарка — набор бета-теста." : "Nick color, message frames, card background and drawn avatar — beta set."}
        </p>
      </section>
    )
  }

  const dirty =
    nickColor !== (data.nick_color || "") ||
    frameColor !== (data.frame_color || "") ||
    cardBg !== (data.card_bg || "") ||
    art !== (data.avatar_art || "")

  async function save(): Promise<void> {
    setSaving(true)
    try {
      const res: any = await api.post("/api/profile/cosmetics", {
        nick_color: nickColor,
        frame_color: frameColor,
        card_bg: cardBg,
        avatar_art: art,
      })
      const saved = { ...EMPTY, ...((res?.cosmetics ?? {}) as Partial<Cosmetics>) }
      const uid = getInitDataUser()?.id
      if (uid) setCachedCosmetics(uid, saved)
      refreshOwnCosmetics()
      reload()
      setSynced(false)
      onToast(ru ? "Оформление сохранено ✨" : "Style saved ✨")
    } catch (e: any) {
      onToast(e?.message || (ru ? "Не сохранилось" : "Save failed"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-4 rounded-3xl border border-border bg-card p-5">
      <div>
        <p className="font-display text-base font-bold">🎨 {ru ? "Своё оформление" : "Custom style"} <span className="ml-1 rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">BETA</span></p>
        <p className="mt-0.5 text-xs text-muted-foreground">{ru ? "Видят все в чатах и профиле." : "Visible to everyone in chats and profile."}</p>
      </div>

      {/* Живое превью */}
      <div className="rounded-2xl border border-border p-3" style={cardBg ? { background: cardBg } : undefined}>
        <div className="flex items-center gap-2.5">
          <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary font-display text-lg font-bold">
            {art ? (
              <img src={art} alt="" className="size-full object-cover" />
            ) : avatar ? (
              <img src={avatar} alt="" className="size-full object-cover" />
            ) : (
              (nick || "?").charAt(0).toUpperCase()
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-base font-bold" style={nickColor ? { color: nickColor } : undefined}>
              {nick || (ru ? "Твой ник" : "Your nick")}
            </p>
            <p className="text-[11px] text-muted-foreground">{ru ? "так выглядит в чате" : "chat preview"}</p>
          </div>
        </div>
        <div className="mt-2.5 flex justify-start">
          <div
            className="max-w-[85%] rounded-2xl rounded-bl-md border border-border bg-secondary px-3 py-2 text-sm"
            style={frameColor ? { borderColor: frameColor, borderWidth: 2 } : undefined}
          >
            {ru ? "Привет! Это моя рамка ✨" : "Hi! This is my frame ✨"}
          </div>
        </div>
      </div>

      <ColorRow label={ru ? "Цвет ника" : "Nick color"} value={nickColor} onChange={setNickColor} />
      <ColorRow label={ru ? "Цвет рамки сообщений" : "Message frame color"} value={frameColor} onChange={setFrameColor} />
      <ColorRow label={ru ? "Фон карточки профиля" : "Profile card background"} value={cardBg} onChange={setCardBg} />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground">{ru ? "Рисованная аватарка" : "Drawn avatar"}</p>
          {art && (
            <button
              type="button"
              onClick={() => setArt("")}
              className="rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-semibold text-muted-foreground active:scale-95"
            >
              {ru ? "Вернуть фото" : "Back to photo"}
            </button>
          )}
        </div>
        <ArtCanvas initial={art} onArt={setArt} />
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving || !dirty}
        className="w-full rounded-2xl bg-primary py-3 font-display text-sm font-bold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-40"
      >
        {saving ? (ru ? "Сохраняю…" : "Saving…") : ru ? "Сохранить оформление" : "Save style"}
      </button>
    </section>
  )
}
