"use client"

import { useState, useRef, useEffect } from "react"
import { Play, Pause, Volume2, VolumeX } from "lucide-react"
import { cn } from "@/lib/utils"

interface VoiceMessagePlayerProps {
  src: string
  duration: number
  isOwn?: boolean
  mime?: string
}

export function VoiceMessagePlayer({ src, duration, isOwn = false, mime = "audio/webm" }: VoiceMessagePlayerProps) {
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio(src)
      audioRef.current.preload = "metadata"
    }
    const audio = audioRef.current

    const onLoadedMetadata = () => setLoaded(true)
    const onTimeUpdate = () => setCurrentTime(audio.currentTime)
    const onEnded = () => setPlaying(false)
    const onError = () => { setPlaying(false); console.error("Audio playback error") }

    audio.addEventListener("loadedmetadata", onLoadedMetadata)
    audio.addEventListener("timeupdate", onTimeUpdate)
    audio.addEventListener("ended", onEnded)
    audio.addEventListener("error", onError)

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata)
      audio.removeEventListener("timeupdate", onTimeUpdate)
      audio.removeEventListener("ended", onEnded)
      audio.removeEventListener("error", onError)
      audio.pause()
      audio.src = ""
    }
  }, [src])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      setPlaying(false)
    } else {
      audio.play().catch(console.error)
      setPlaying(true)
    }
  }

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
    audio.muted = !muted
  }

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  }

  const totalDuration = loaded && audioRef.current ? audioRef.current.duration : duration

  return (
    <div className={cn("flex items-center gap-2", isOwn ? "ml-auto" : "")}>
      <button
        type="button"
        onClick={togglePlay}
        className={cn(
          "flex items-center justify-center size-8 rounded-xl transition-colors",
          isOwn ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-foreground",
          "hover:opacity-80 active:scale-95"
        )}
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
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