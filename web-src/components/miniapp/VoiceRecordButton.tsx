"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Mic, Loader2 } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

interface VoiceRecordButtonProps {
  chatId: string
  onSend: (msg: any) => void
  disabled?: boolean
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

export function VoiceRecordButton({ chatId, onSend, disabled }: VoiceRecordButtonProps) {
  const { t } = useI18n()
  const [recording, setRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  // Палец сейчас на кнопке? Нужно, потому что системное окно Telegram
  // («дать боту доступ к микрофону») требует отпустить кнопку, чтобы тапнуть
  // «Разрешить» — холд при этом прерывается, и это нормально.
  const pressActiveRef = useRef(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeRef = useRef("audio/webm")
  const extRef = useRef("webm")
  const startTimeRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sentRef = useRef(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const downTimeRef = useRef(0)
  // Короткий тап — не холд: открываем системный пиккер (там часто есть
  // «записать аудио»), вместо отправки пустого куска.
  const tapPickRef = useRef(false)
  // Подряд идущие отказы микрофона: после 2-го подряд ведём человека
  // на запасной путь (кнопка с роботом), а не крутим один и тот же тост.
  const failCountRef = useRef(0)

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
    mediaRecorderRef.current = null
    sentRef.current = false
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
    const blobParts = chunksRef.current
    const mime = mimeRef.current
    const ext = extRef.current
    const secs = Math.floor((Date.now() - startTimeRef.current) / 1000)
    // Короткий тап (<0.5с) — не отправляем, это был не холд
    if (secs < 1 && blobParts.length === 0) {
      cleanup()
      return
    }
    const blob = new Blob(blobParts, { type: mime || "audio/webm" })
    if (blob.size < 500) {
      // Короткий тап — ошибку не показываем, вместо этого уже открыт пиккер
      if (!tapPickRef.current) setError(t("chat.voice_too_short"))
      tapPickRef.current = false
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
    if (!md?.getUserMedia) {
      setError(t("chat.mic_unsupported"))
      return
    }
    // Состояние разрешения — только для диагностики, НЕ для раннего выхода:
    // в WebView оно может врать/застревать, а ранний return лишает браузер
    // шанса показать промпт заново (и в WebView Телеги нет иконки замка,
    // чтобы сбросить запрет вручную). Поэтому всегда пробуем getUserMedia —
    // при реальном запрете он и так упадёт мгновенно.
    let permState = "unknown"
    try {
      const perm = await (navigator as any).permissions?.query?.({ name: "microphone" })
      if (perm?.state) permState = perm.state
    } catch {}
    if (typeof window.MediaRecorder === "undefined") {
      setError(t("chat.mic_unsupported"))
      return
    }
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
      rec.start(100)
      failCountRef.current = 0
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
        failCountRef.current += 1
        // Разрешение вроде есть (perm granted/prompt), а хост всё равно режет —
        // это блок уровня WebView/приложения, а не сайта. Со второго подряд
        // отказа ведём на кнопку с роботом — она работает всегда.
        if (failCountRef.current >= 2) {
          setError(t("chat.mic_use_tg_instead"))
        } else {
          setError(permState === "granted" ? t("chat.mic_webview_blocked") : t("chat.mic_denied"))
        }
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

  const onFilePicked = useCallback(async (file: File) => {
    if (!file || file.size === 0) return
    if (file.size > 2 * 1024 * 1024) {
      setError(t("chat.voice_send_failed"))
      return
    }
    setError(null)
    // Длительность — из метаданных файла, чтобы пузырь показывал правду
    let secs = 0
    try {
      const url = URL.createObjectURL(file)
      secs = await new Promise<number>((resolve) => {
        const a = new Audio()
        const done = (v: number) => {
          try {
            URL.revokeObjectURL(url)
          } catch {}
          resolve(v)
        }
        a.preload = "metadata"
        a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? Math.floor(a.duration) : 0)
        a.onerror = () => done(0)
        a.src = url
        setTimeout(() => done(0), 4000)
      })
    } catch {
      secs = 0
    }
    const formData = new FormData()
    const ext = (file.name.split(".").pop() || "m4a").slice(0, 8)
    formData.append("audio", file, `voice.${ext}`)
    setUploading(true)
    try {
      const res = await api.postForm<{ message: any }>(`/api/chat/${chatId}/voice`, formData, {
        "X-Duration": String(Math.min(secs, 60)),
      })
      if (res?.message) onSend(res.message)
    } catch (err: any) {
      setError(err?.message ?? t("chat.voice_send_failed"))
    } finally {
      setUploading(false)
    }
  }, [chatId, onSend, t])

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

  return (
    <div className="relative">
      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ""
          if (f) void onFilePicked(f)
        }}
      />
      <button
        type="button"
        disabled={disabled || uploading}
        onPointerDown={(e) => {
          e.preventDefault()
          downTimeRef.current = Date.now()
          tapPickRef.current = false
          pressActiveRef.current = true
          void handlePress()
        }}
        onPointerUp={(e) => {
          e.preventDefault()
          // Короткий тап (<280мс): прямой холд не нужен — открываем системный
          // пиккер аудио прямо в жесте (там обычно есть и запись).
          if (Date.now() - downTimeRef.current < 280 && !uploading) {
            tapPickRef.current = true
            try {
              fileRef.current?.click()
            } catch {}
          }
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
        title={t("chat.voice_btn_hint")}
      >
        {uploading ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <>
            <Mic className="size-5" />
            {recording && (
              <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] font-mono tabular-nums bg-black/80 text-white px-1.5 py-0.5 rounded">
                {String(Math.floor(duration / 60)).padStart(2, "0")}:{String(duration % 60).padStart(2, "0")}
              </span>
            )}
          </>
        )}
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

      {recording && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-10 text-center pointer-events-none">
          <p className="text-[11px] text-muted-foreground bg-background/90 px-3 py-1.5 rounded-xl shadow-lg border border-border whitespace-nowrap">
            {t("chat.release_to_send")}
          </p>
        </div>
      )}
    </div>
  )
}
