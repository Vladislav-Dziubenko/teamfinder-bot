"use client"

import { useState, useRef, useCallback } from "react"
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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeRef = useRef("audio/webm")
  const extRef = useRef("webm")
  const startTimeRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sentRef = useRef(false)

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
    if (!md?.getUserMedia) {
      setError(t("chat.mic_unsupported"))
      return
    }
    // Если доступ уже запрещён на уровне браузера/ОС — запрос мгновенно
    // упадёт без промпта. Сразу говорим человеку, где разблокировать.
    let permState = "unknown"
    try {
      const perm = await (navigator as any).permissions?.query?.({ name: "microphone" })
      if (perm?.state) permState = perm.state
      if (perm?.state === "denied") {
        setError(t("chat.mic_denied"))
        return
      }
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
      startTimeRef.current = Date.now()
      rec.start(100)
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
        // Разрешение вроде есть (perm granted/prompt), а хост всё равно режет —
        // это блок уровня WebView/приложения, а не сайта.
        setError(permState === "granted" ? t("chat.mic_webview_blocked") : t("chat.mic_denied"))
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
      <button
        type="button"
        disabled={disabled || uploading}
        onPointerDown={(e) => {
          e.preventDefault()
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
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 max-w-[220px] text-center text-[10px] text-red-500 whitespace-normal bg-red-500/10 px-2 py-1 rounded">
          {error}
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
