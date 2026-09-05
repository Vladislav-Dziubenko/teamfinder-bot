"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Play, Pause, Volume2, VolumeX, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { getInitData } from "@/lib/api"

interface VoiceMessagePlayerProps {
  src: string
  duration: number
  isOwn?: boolean
  mime?: string
}

function reportPlayError(extra: string) {
  try {
    navigator.sendBeacon?.(
      "/api/client-error",
      new Blob([JSON.stringify({ message: `voice play ${extra}`, tab: "chat", url: location.href })], { type: "application/json" }),
    )
  } catch {}
}

export function VoiceMessagePlayer({ src, duration, isOwn = false, mime = "audio/webm" }: VoiceMessagePlayerProps) {
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)
  const volumeRef = useRef(1)
  const mutedRef = useRef(false)

  // ВАЖНО: голый <audio src> шлёт запрос БЕЗ X-Telegram-Init-Data,
  // сервер отвечает 401 и в плеере тишина. Поэтому качаем авторизованным
  // fetch и отдаём тегу blob-URL (файлы маленькие, до 2МБ).
  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    let audio: HTMLAudioElement | null = null

    const onLoadedMetadata = () => {
      setLoaded(true)
      setLoading(false)
    }
    const onTimeUpdate = () => {
      if (audio) setCurrentTime(audio.currentTime)
    }
    const onEnded = () => setPlaying(false)
    const onError = () => {
      setPlaying(false)
      setLoading(false)
      if (!cancelled) {
        setLoadError("audio-element-error")
        reportPlayError(`element error src_len=${src.length}`)
      }
    }

    const load = async () => {
      setLoading(true)
      setLoadError(null)
      setLoaded(false)
      try {
        const res = await fetch(src, { headers: { "X-Telegram-Init-Data": getInitData() } })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        if (cancelled) return
        if (blob.size === 0) throw new Error("empty blob")
        objectUrl = URL.createObjectURL(blob)
        audio = new Audio(objectUrl)
        audio.preload = "metadata"
        audio.volume = volumeRef.current
        audio.muted = mutedRef.current
        audioRef.current = audio
        audio.addEventListener("loadedmetadata", onLoadedMetadata)
        audio.addEventListener("timeupdate", onTimeUpdate)
        audio.addEventListener("ended", onEnded)
        audio.addEventListener("error", onError)
      } catch (e: any) {
        if (!cancelled) {
          setLoading(false)
          setLoadError(e?.message || "load failed")
          reportPlayError(`load failed: ${e?.message || e}`)
        }
      }
    }
    void load()

    return () => {
      cancelled = true
      if (audio) {
        audio.removeEventListener("loadedmetadata", onLoadedMetadata)
        audio.removeEventListener("timeupdate", onTimeUpdate)
        audio.removeEventListener("ended", onEnded)
        audio.removeEventListener("error", onError)
        try {
          audio.pause()
        } catch {}
      }
      audioRef.current = null
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl)
        } catch {}
      }
    }
  }, [src, retryKey])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      try {
        audio.pause()
      } catch {}
      setPlaying(false)
      return
    }
    // play() — промис: успех подтверждаем только по resolve,
    // отказ показываем и шлём в логи (раньше глохло молча).
    audio
      .play()
      .then(() => setPlaying(true))
      .catch((e: any) => {
        setPlaying(false)
        setLoadError(e?.name === "NotAllowedError" ? "play-blocked" : `play failed: ${e?.name || e}`)
        reportPlayError(`play rejected: ${e?.name || e} ${String(e?.message || "").slice(0, 120)}`)
      })
  }, [playing])

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current
    if (!audio || !audio.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const percent = (e.clientX - rect.left) / rect.width
    audio.currentTime = percent * audio.duration
  }

  const toggleMute = () => {
    const audio = audioRef.current
    if (!audio) return
    setMuted(!muted)
    mutedRef.current = !muted
    audio.muted = !muted
  }

  const formatTime = (sec: number) => {
    if (!Number.isFinite(sec) || sec < 0) sec = 0
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  }

  const totalDuration = loaded && audioRef.current && Number.isFinite(audioRef.current.duration) ? audioRef.current.duration : duration

  return (
    <div className={cn("flex items-center gap-2", isOwn ? "ml-auto" : "")}>
      <button
        type="button"
        onClick={() => {
          if (loadError) {
            setRetryKey((k) => k + 1)
            return
          }
          togglePlay()
        }}
        className={cn(
          "flex items-center justify-center size-8 rounded-xl transition-colors",
          isOwn ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-foreground",
          "hover:opacity-80 active:scale-95"
        )}
        aria-label={playing ? "Pause" : "Play"}
      >
        {loading ? (
          <Loader2 className="size-5 animate-spin" />
        ) : loadError ? (
          <Play className="size-5 opacity-60" />
        ) : playing ? (
          <Pause className="size-5" />
        ) : (
          <Play className="size-5" />
        )}
      </button>

      <div className="flex items-center gap-2 min-w-[140px] max-w-[200px]">
        <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
          {formatTime(currentTime)}
        </span>
        <div className="flex-1 h-1.5 bg-secondary/40 rounded-full cursor-pointer relative" onClick={seek}>
          <div
            className="h-full bg-primary/60 rounded-full transition-all duration-75"
            style={{ width: loaded && totalDuration > 0 ? `${(currentTime / totalDuration) * 100}%` : "0%" }}
          />
        </div>
        <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
          {formatTime(totalDuration)}
        </span>
      </div>

      {loadError && (
        <span className="text-[10px] text-red-500 max-w-[90px] leading-tight" title={loadError}>
          !retry
        </span>
      )}

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={toggleMute}
          className={cn("p-1 rounded-lg transition-colors", muted && "opacity-50")}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={volume}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            setVolume(v)
            volumeRef.current = v
            if (audioRef.current) audioRef.current.volume = v
          }}
          className="w-16 h-1 appearance-none bg-secondary/40 rounded-full accent-primary"
          aria-label="Volume"
        />
      </div>
    </div>
  )
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}
