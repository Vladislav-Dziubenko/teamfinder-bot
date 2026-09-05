"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Mic, Loader2, Trash2, MicOff } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

interface VoiceRecordButtonProps {
  chatId: string
  onSend: (msg: any) => void
  disabled?: boolean
  // Запасной путь (нативный войс Телеги через бота). Показываем его
  // прямо в модалке отказа — иначе человек упирается в тупик.
  onViaTelegram?: (() => void) | null
}

function pickMime(): { mime: string; ext: string } {
  try {
    const MR = window.MediaRecorder as any
    if (MR?.isTypeSupported?.("audio/webm;codecs=opus")) return { mime: "audio/webm;codecs=opus", ext: "webm" }
    if (MR?.isTypeSupported?.("audio/webm")) return { mime: "audio/webm", ext: "webm" }
    if (MR?.isTypeSupported?.("audio/mp4")) return { mime: "audio/mp4", ext: "m4a" }
  } catch {}
  return { mime: "", ext: "webm" }
}

/** Живая волна записи: полосы частот с микрофона. */
function WaveBars({ stream }: { stream: MediaStream | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!stream) return
    const AC = window.AudioContext || (window as any).webkitAudioContext
    if (!AC) return
    let ctx: AudioContext | null = null
    let raf = 0
    try {
      ctx = new AC()
      const src = ctx.createMediaStreamSource(stream)
      const an = ctx.createAnalyser()
      an.fftSize = 64
      src.connect(an)
      const data = new Uint8Array(an.frequencyBinCount)
      const draw = () => {
        raf = requestAnimationFrame(draw)
        an.getByteFrequencyData(data)
        const cv = canvasRef.current
        if (!cv) return
        const g = cv.getContext("2d")
        if (!g) return
        const W = cv.width
        const H = cv.height
        g.clearRect(0, 0, W, H)
        const n = 24
        const bw = W / n
        for (let i = 0; i < n; i++) {
          const v = data[Math.floor((i * data.length) / n)] / 255
          const h = Math.max(3, v * H)
          g.fillStyle = "rgba(255,255,255,0.92)"
          const x = i * bw + bw * 0.22
          const w = bw * 0.56
          const y = (H - h) / 2
          try {
            ;(g as any).roundRect(x, y, w, h, 2)
            g.fill()
          } catch {
            g.fillRect(x, y, w, h)
          }
        }
      }
      draw()
    } catch {
      // без волны — таймер всё равно идёт
    }
    return () => {
      cancelAnimationFrame(raf)
      try {
        ctx?.close()?.catch(() => {})
      } catch {}
    }
  }, [stream])

  return <canvas ref={canvasRef} width={168} height={36} className="h-9 w-40 shrink-0" />
}

export function VoiceRecordButton({ chatId, onSend, disabled, onViaTelegram }: VoiceRecordButtonProps) {
  const { t } = useI18n()
  const [recording, setRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [showPermModal, setShowPermModal] = useState(false)
  // Палец сейчас на кнопке? Нужно, потому что системное окно Telegram
  // («дать боту доступ к микрофону») требует отпустить кнопку, чтобы тапнуть
  // «Разрешить» — холд при этом прерывается, и это нормально.
  const pressActiveRef = useRef(false)
  // Отмена через кнопку в HUD: релиз должен выкинуть запись молча
  const cancelledRef = useRef(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeRef = useRef("audio/webm")
  const extRef = useRef("webm")
  const startTimeRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((tr) => {
        try {
          tr.stop()
        } catch {}
      })
      streamRef.current = null
    }
    setLiveStream(null)
    mediaRecorderRef.current = null
    cancelledRef.current = false
    setRecording(false)
    setDuration(0)
  }, [])

  // Ошибка/подсказка — короткие тосты, сами гаснут через 4с
  useEffect(() => {
    if (!error) return
    const id = setTimeout(() => setError(null), 4000)
    return () => clearTimeout(id)
  }, [error])
  useEffect(() => {
    if (!info) return
    const id = setTimeout(() => setInfo(null), 3500)
    return () => clearTimeout(id)
  }, [info])

  const finishUpload = useCallback(async () => {
    if (cancelledRef.current) {
      cleanup()
      return
    }
    const blobParts = chunksRef.current
    const mime = mimeRef.current
    const ext = extRef.current
    const secs = Math.floor((Date.now() - startTimeRef.current) / 1000)
    const blob = new Blob(blobParts, { type: mime || "audio/webm" })
    if (secs < 1 || blob.size < 500) {
      setError(t("chat.voice_too_short"))
      cleanup()
      return
    }
    const formData = new FormData()
    formData.append("audio", blob, `voice.${ext}`)
    setUploading(true)
    try {
      const res = await api.postForm<{ message: any }>(`/api/chat/${chatId}/voice`, formData, {
        "X-Duration": String(Math.min(secs, 60)),
      })
      if (res?.message) onSend(res.message)
      setError(null)
    } catch (err: any) {
      setError(err?.message ?? t("chat.voice_send_failed"))
    } finally {
      setUploading(false)
      cleanup()
    }
  }, [chatId, onSend, cleanup, t])

  // Старт — СИНХРОННО в жесте (pointerdown), без setTimeout:
  // иначе WebView теряет user activation и кидает NotAllowedError
  // даже при разрешённом микрофоне.
  const handlePress = useCallback(async () => {
    if (disabled || uploading || recording) return
    setError(null)
    const md = navigator.mediaDevices
    if (!md?.getUserMedia || typeof window.MediaRecorder === "undefined") {
      setError(t("chat.mic_unsupported"))
      return
    }
    // Состояние разрешения — только для диагностики, НЕ для раннего выхода:
    // в WebView оно может врать/застревать, а ранний return лишает браузер
    // шанса показать промпт заново. Поэтому всегда пробуем getUserMedia —
    // при реальном запрете он и так упадёт мгновенно.
    let permState = "unknown"
    try {
      const perm = await (navigator as any).permissions?.query?.({ name: "microphone" })
      if (perm?.state) permState = perm.state
    } catch {}
    // Сколько аудиоустройств вообще видит WebView (без лейблов до разрешения).
    // Ноль = хост режет захват на своём уровне, getUserMedia не поможет.
    let audioInputs = -1
    try {
      const devs = await md.enumerateDevices()
      audioInputs = devs.filter((d: any) => d.kind === "audioinput").length
    } catch {}
    const report = (extra: string) => {
      try {
        const inTg = typeof window !== "undefined" && !!(window as any).Telegram?.WebApp
        navigator.sendBeacon?.(
          "/api/client-error",
          new Blob(
            [JSON.stringify({ message: `mic diag ${extra} | perm=${permState} inputs=${audioInputs} secure=${window.isSecureContext} tg=${inTg}`, tab: "chat", url: location.href })],
            { type: "application/json" },
          ),
        )
      } catch {}
    }
    if (audioInputs === 0) {
      report("no-audioinput-enumerated")
      setError(t("chat.mic_no_device"))
      return
    }
    try {
      const stream = await md.getUserMedia({ audio: true })
      streamRef.current = stream
      const picked = pickMime()
      mimeRef.current = picked.mime
      extRef.current = picked.ext
      chunksRef.current = []
      const rec = picked.mime ? new MediaRecorder(stream, { mimeType: picked.mime }) : new MediaRecorder(stream)
      mediaRecorderRef.current = rec
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onstop = () => {
        void finishUpload()
      }
      rec.onerror = () => {
        setError(t("chat.voice_send_failed"))
        cleanup()
      }
      // Если палец уже отпущен (вылезло системное окно Telegram и человек
      // отпустил кнопку, чтобы тапнуть «Разрешить») — не стартуем призрачную
      // запись, а фиксируем: микрофон разблокирован, просим зажать ещё раз.
      if (!pressActiveRef.current) {
        try {
          stream.getTracks().forEach((tr) => {
            try {
              tr.stop()
            } catch {}
          })
        } catch {}
        streamRef.current = null
        mediaRecorderRef.current = null
        setInfo(t("chat.mic_ready"))
        return
      }
      startTimeRef.current = Date.now()
      cancelledRef.current = false
      rec.start(100)
      setLiveStream(stream)
      setRecording(true)
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000))
      }, 200)
    } catch (err: any) {
      const name = err?.name || "UnknownError"
      const detail = String(err?.message || "").slice(0, 200)
      // Диагностика на сервер — в логах будет точная причина
      report(`gUM failed: ${name} ${detail}`)
      if (name === "NotAllowedError" || name === "SecurityError") {
        // Красивая модалка вместо тоста: просим разрешить микрофон
        // в настройках Telegram. Файловый менеджер не открываем.
        setShowPermModal(true)
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setError(t("chat.mic_no_device"))
      } else if (name === "NotSupportedError") {
        setError(t("chat.mic_unsupported"))
      } else {
        setError(t("chat.mic_denied"))
      }
      cleanup()
    }
  }, [disabled, uploading, recording, finishUpload, cleanup, t])

  const handleRelease = useCallback(() => {
    pressActiveRef.current = false
    const rec = mediaRecorderRef.current
    if (!rec || rec.state === "inactive") return
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    try {
      rec.stop()
    } catch {
      cleanup()
    }
    // setRecording(false) случится в cleanup после загрузки
  }, [cleanup])

  const handleCancel = useCallback(() => {
    cancelledRef.current = true
    handleRelease()
  }, [handleRelease])

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled || uploading}
        onPointerDown={(e) => {
          e.preventDefault()
          pressActiveRef.current = true
          void handlePress()
        }}
        onPointerUp={(e) => {
          e.preventDefault()
          handleRelease()
        }}
        onPointerLeave={handleRelease}
        onPointerCancel={handleRelease}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          "grid size-10 touch-none place-items-center rounded-xl transition-colors active:scale-95 select-none",
          recording ? "bg-red-500 text-white animate-pulse" : "bg-secondary/60 text-muted-foreground hover:bg-secondary",
        )}
        aria-label={recording ? t("chat.recording") : t("chat.record_voice")}
      >
        {uploading ? <Loader2 className="size-5 animate-spin" /> : <Mic className="size-5" />}
      </button>

      {error && (
        <div className="fixed left-1/2 bottom-36 z-[90] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-red-500/30 bg-background/95 px-3 py-2 text-center text-xs text-red-500 shadow-xl backdrop-blur">
          {error}
        </div>
      )}

      {info && !error && (
        <div className="fixed left-1/2 bottom-36 z-[90] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-primary/30 bg-background/95 px-3 py-2 text-center text-xs text-primary shadow-xl backdrop-blur">
          {info}
        </div>
      )}

      {/* HUD записи в стиле Telegram: таймер + живая волна + отмена */}
      {recording && (
        <div className="fixed inset-x-0 bottom-[132px] z-[85] mx-auto w-[calc(100%-2rem)] max-w-md pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-3 rounded-3xl border border-red-500/30 bg-[#1c1e22]/95 px-4 py-3 shadow-2xl backdrop-blur">
            <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-red-500" />
            <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-white">{fmt(duration)}</span>
            <WaveBars stream={liveStream} />
            <button
              type="button"
              onClick={handleCancel}
              aria-label={t("common.cancel")}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-white/80 transition-colors active:scale-90 active:bg-white/20"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          <p className="mt-1.5 text-center text-[11px] text-muted-foreground">{t("chat.release_to_send")}</p>
        </div>
      )}

      {/* Модалка доступа к микрофону */}
      {showPermModal && (
        <div
          className="fixed inset-0 z-[95] flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={() => setShowPermModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-border bg-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-red-500/10 text-red-500">
              <MicOff className="size-7" />
            </div>
            <h3 className="mt-3 text-center font-display text-lg font-bold">{t("chat.mic_modal_title")}</h3>
            <p className="mt-2 whitespace-pre-line text-center text-sm text-muted-foreground">{t("chat.mic_modal_text")}</p>
            <button
              type="button"
              onClick={() => {
                setShowPermModal(false)
                void handlePress()
              }}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground active:scale-[0.98]"
            >
              <Mic className="size-4" />
              {t("chat.mic_modal_retry")}
            </button>
            {onViaTelegram && (
              <button
                type="button"
                onClick={() => {
                  setShowPermModal(false)
                  onViaTelegram()
                }}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-primary/40 bg-primary/10 py-3 text-sm font-bold text-primary active:scale-[0.98]"
              >
                {t("chat.mic_modal_via_tg")}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowPermModal(false)}
              className="mt-2 w-full rounded-2xl py-2.5 text-sm font-semibold text-muted-foreground active:scale-[0.98]"
            >
              {t("chat.mic_modal_close")}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
