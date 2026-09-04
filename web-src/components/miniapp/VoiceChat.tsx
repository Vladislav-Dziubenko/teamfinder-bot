"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { Mic, MicOff, Headphones, VolumeX, Volume2, Users, X, Loader2, Settings, Shield } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { useVoiceChat } from "@/lib/hooks/useVoiceChat"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useNexus } from "@/lib/store"

interface VoiceChatProps {
  sessionId: number
  isCreator: boolean
  onClose: () => void
}

export function VoiceChat({ sessionId, isCreator, onClose }: VoiceChatProps) {
  const { t } = useI18n()
  const { userId } = useNexus()
  const [enabled, setEnabled] = useState(false)
  const [showParticipants, setShowParticipants] = useState(true)
  const [voiceEnabled, setVoiceEnabled] = useState(false)

  const {
    connected,
    participants,
    localStream,
    muted,
    deafened,
    speaking,
    error,
    wsConnected,
  } = useVoiceChat(sessionId, userId, enabled)

  useEffect(() => {
    api.get("/api/sessions/" + sessionId).then((res) => {
      setVoiceEnabled(res?.voice_enabled || false)
    }).catch(console.error)
  }, [sessionId])

  const handleJoin = useCallback(async () => {
    try {
      await api.post("/api/sessions/" + sessionId + "/voice/join")
      setEnabled(true)
    } catch (err: any) {
      alert(err?.message ?? "Failed to join voice chat")
    }
  }, [sessionId])

  const handleLeave = useCallback(async () => {
    setEnabled(false)
    try {
      await api.post("/api/sessions/" + sessionId + "/voice/leave")
    } catch (err) {
      console.error("Leave voice error:", err)
    }
  }, [sessionId])

  const handleToggleVoice = useCallback(async () => {
    try {
      const res = await api.post("/api/sessions/" + sessionId + "/voice/toggle", { enabled: !voiceEnabled })
      setVoiceEnabled(res.voice_enabled)
      if (!res.voice_enabled) setEnabled(false)
    } catch (err) {
      alert("Failed to toggle voice chat")
    }
  }, [sessionId, voiceEnabled])

  const handleMute = useCallback(async () => {
    const newMuted = !muted
    try {
      await api.post("/api/sessions/" + sessionId + "/voice/mute", { muted: newMuted })
    } catch (err) {
      console.error("Mute error:", err)
    }
  }, [muted])

  const handleDeafen = useCallback(async () => {
    const newDeafened = !deafened
    try {
      await api.post("/api/sessions/" + sessionId + "/voice/deafen", { deafened: newDeafened })
    } catch (err) {
      console.error("Deafen error:", err)
    }
  }, [deafened])

  if (!enabled && !voiceEnabled) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-bold">{t("voice.title")}</h2>
            <button onClick={onClose} className="grid size-8 place-items-center rounded-xl text-muted-foreground hover:bg-secondary/50 active:scale-90">
              <X className="size-5" />
            </button>
          </div>

          <div className="text-center py-8">
            <Users className="mx-auto size-16 text-primary/50 mb-4" />
            <h3 className="font-display text-xl font-bold mb-2">{t("voice.join_title")}</h3>
            <p className="text-sm text-muted-foreground mb-6">{t("voice.join_desc")}</p>

            {voiceEnabled ? (
              <button
                onClick={handleJoin}
                disabled={false}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground active:scale-[0.98]"
              >
                <Mic className="size-5" />
                {t("voice.join_btn")}
              </button>
            ) : (
              <div className="rounded-xl border border-border bg-muted/50 p-4 text-center text-sm text-muted-foreground">
                <Shield className="mx-auto size-5 mb-2 text-muted-foreground" />
                {t("voice.disabled_by_creator")}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60">
      <header className="flex items-center justify-between gap-2 border-b border-border/50 bg-card/95 backdrop-blur-xl px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={handleLeave} className="grid size-9 place-items-center rounded-xl text-muted-foreground hover:bg-secondary/50 active:scale-90">
            <X className="size-5" />
          </button>
          <div>
            <h2 className="font-display text-lg font-bold">{t("voice.title")}</h2>
            <p className="text-[11px] text-muted-foreground">{participants.size} / {t("voice.participants")}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const audioTracks = localStream?.getAudioTracks()
              if (audioTracks) {
                const newMuted = !muted
                audioTracks.forEach((t) => (t.enabled = !newMuted))
                setMuted(newMuted)
              }
            }}
            className={cn(
              "grid size-9 place-items-center rounded-xl transition-colors active:scale-95",
              muted ? "bg-destructive/10 text-destructive" : "bg-secondary/60 text-muted-foreground hover:bg-secondary"
            )}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
          </button>

          <button
            onClick={() => {
              const newDeafened = !deafened
              setDeafened(newDeafened)
            }}
            className={cn(
              "grid size-9 place-items-center rounded-xl transition-colors active:scale-95",
              deafened ? "bg-destructive/10 text-destructive" : "bg-secondary/60 text-muted-foreground hover:bg-secondary"
            )}
            aria-label={deafened ? "Undeafen" : "Deafen"}
          >
            {deafened ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
          </button>

          {isCreator && (
            <button
              onClick={() => setVoiceEnabled(!voiceEnabled)}
              className={cn(
                "grid size-9 place-items-center rounded-xl transition-colors active:scale-95",
                voiceEnabled ? "bg-primary/10 text-primary" : "bg-secondary/60 text-muted-foreground hover:bg-secondary"
              )}
              aria-label={voiceEnabled ? "Disable voice chat" : "Enable voice chat"}
            >
              <Settings className="size-5" />
            </button>
          )}
        </div>
      </header>

      {speaking && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 animate-pulse">
          <div className="flex items-center gap-1.5 rounded-xl bg-primary/90 text-primary-foreground px-3 py-1.5 text-xs font-bold">
            <Mic className="size-3.5" />
            {t("voice.speaking")}
          </div>
        </div>
      )}

      {error && (
        <div className="mx-4 mt-2 rounded-xl border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-destructive/70 hover:text-destructive">
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className={cn("px-4 py-1 text-[10px] font-mono", connected ? "text-green-500" : "text-red-500")}>
        {connected ? "Connected" : "Disconnected"}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="space-y-2">
          {Array.from(participants.entries()).map(([pid, p]) => (
            <div
              key={pid}
              className={cn(
                "flex items-center gap-3 rounded-xl bg-card p-3 transition-colors",
                p.speaking && "ring-2 ring-primary/50 animate-pulse"
              )}
            >
              <div className="relative">
                <div className="size-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <Mic className="size-5 text-primary" />
                </div>
                <span className="absolute -top-1 -right-1 size-5 rounded-full bg-primary text-primary-foreground text-[9px] font-bold">
                  {p.speaking ? "LIVE" : ""}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">{p.nick || "User" + pid}</p>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  {p.muted && <MicOff className="size-3" />}
                  {p.deafened && <VolumeX className="size-3" />}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {p.muted && <MicOff className="size-4 text-muted-foreground" />}
                {p.deafened && <VolumeX className="size-4 text-muted-foreground" />}
                {p.speaking && <span className="text-[10px] font-bold text-primary animate-pulse">LIVE</span>}
              </div>
            </div>
          ))}
        </div>

        {participants.size === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="mx-auto size-12 mb-2" />
            <p className="text-sm">No participants yet</p>
          </div>
        )}
      </div>

      <div className="border-t border-border/50 bg-card/95 backdrop-blur-xl px-4 py-3">
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => {
              const audioTracks = localStream?.getAudioTracks()
              if (audioTracks) {
                const newMuted = !muted
                audioTracks.forEach((t) => (t.enabled = !newMuted))
                setMuted(newMuted)
              }
            }}
            className={cn(
              "flex flex-col items-center gap-1 rounded-xl px-4 py-2.5 transition-colors active:scale-95",
              muted ? "bg-destructive/10 text-destructive" : "bg-secondary/60 text-muted-foreground"
            )}
          >
            {muted ? <MicOff className="size-6" /> : <Mic className="size-6" />}
            <span className="text-[10px] font-medium">{muted ? "Muted" : "Mic On"}</span>
          </button>

          <button
            onClick={() => {
              const newDeafened = !deafened
              setDeafened(newDeafened)
            }}
            className={cn(
              "flex flex-col items-center gap-1 rounded-xl px-4 py-2.5 transition-colors active:scale-95",
              deafened ? "bg-destructive/10 text-destructive" : "bg-secondary/60 text-muted-foreground"
            )}
          >
            {deafened ? <VolumeX className="size-6" /> : <Volume2 className="size-6" />}
            <span className="text-[10px] font-medium">{deafened ? "Deafened" : "Hearing"}</span>
          </button>

          <div className="flex flex-col items-center gap-1 rounded-xl bg-primary/10 text-primary px-4 py-2.5">
            <span className={cn("size-2 rounded-full", speaking ? "bg-green-500 animate-pulse" : "bg-muted-foreground/30")} />
            <span className="text-[10px] font-medium">{speaking ? "Speaking" : "Silent"}</span>
          </div>
        </div>
      </div>
    </div>
  )
}