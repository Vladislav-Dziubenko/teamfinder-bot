"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Mic, MicOff, Loader2 } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

interface VoiceRecordButtonProps {
  chatId: string
  onSend: (msg: any) => void
  disabled?: boolean
}

export function VoiceRecordButton({ chatId, onSend, disabled }: VoiceRecordButtonProps) {
  const { t } = useI18n()
  const [recording, setRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef<number>(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null)
  const isLongPressRef = useRef(false)

  const startRecording = useCallback(async () => {
    if (disabled) return

    try {
      setError(null)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" })
        const duration = Math.floor((Date.now() - startTimeRef.current) / 1000)

        // Send to server (multipart — api.post шлёт только JSON, для FormData есть postForm)
        const formData = new FormData()
        formData.append("audio", blob, "voice.webm")

        try {
          const res = await api.postForm<{ message: any }>(`/api/chat/${chatId}/voice`, formData, {
            "X-Duration": String(duration),
          })
          if (res?.message) {
            onSend(res.message)
          }
        } catch (err: any) {
          setError(err?.message ?? "Failed to send voice message")
        } finally {
          stream.getTracks().forEach(t => t.stop())
        }
      }

      mediaRecorder.start(100)
      setRecording(true)
      startTimeRef.current = Date.now()
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000))
      }, 200)
    } catch (err) {
      setError("Microphone access denied")
    }
  }, [chatId, onSend, disabled])

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop()
    }
    setRecording(false)
    setDuration(0)
  }, [])

  // Touch handlers for press-hold
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault()
    isLongPressRef.current = false
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true
      startRecording()
    }, 300) // 300ms to trigger recording
  }, [startRecording])

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault()
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
    if (!isLongPressRef.current) return // Was just a tap, not long press
    stopRecording()
  }, [stopRecording])

  // Mouse handlers for desktop testing
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return // Only left click
    isLongPressRef.current = false
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true
      startRecording()
    }, 300)
  }, [startRecording])

  const onMouseUp = useCallback(() => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
    if (!isLongPressRef.current) return
    stopRecording()
  }, [stopRecording])

  const onMouseLeave = useCallback(() => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
    if (!isLongPressRef.current) return
    stopRecording()
  }, [stopRecording])

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled || recording}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        className={cn(
          "grid size-10 place-items-center rounded-xl transition-colors active:scale-95",
          recording ? "bg-red-500 text-white animate-pulse" : "bg-secondary/60 text-muted-foreground hover:bg-secondary"
        )}
        aria-label={recording ? t("chat.recording") : t("chat.record_voice")}
      >
        {recording ? (
          <>
            <Mic className="size-5" />
            <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] font-mono tabular-nums bg-black/80 text-white px-1.5 py-0.5 rounded">
              {String(Math.floor(duration / 60)).padStart(2, "0")}:{String(duration % 60).padStart(2, "0")}
            </span>
          </>
        ) : (
          <Mic className="size-5" />
        )}
      </button>

      {error && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 text-[10px] text-red-500 whitespace-nowrap bg-red-500/10 px-2 py-1 rounded">
          {error}
        </div>
      )}

      {recording && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-10 text-center">
          <p className="text-[11px] text-muted-foreground bg-background/90 px-3 py-1.5 rounded-xl shadow-lg border border-border">
            {t("chat.release_to_send")}
          </p>
        </div>
      )}
    </div>
  )
}