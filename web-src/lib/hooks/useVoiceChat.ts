"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { api, getInitData } from "@/lib/api"

export type VoicePeer = {
  stream: MediaStream
  muted: boolean
  deafened: boolean
  speaking: boolean
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
  iceCandidatePoolSize: 10,
}

export function useVoiceChat(sessionId: number, userId: number, enabled: boolean) {
  const [connected, setConnected] = useState(false)
  const [participants, setParticipants] = useState<Map<number, VoicePeer>>(new Map())
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [muted, setMuted] = useState(false)
  const [deafened, setDeafened] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [names, setNames] = useState<Map<number, { nick?: string | null; avatar?: string | null }>>(new Map())

  const wsRef = useRef<WebSocket | null>(null)
  const pcRef = useRef(new Map<number, RTCPeerConnection>())
  const localRef = useRef<MediaStream | null>(null)
  const mutedRef = useRef(false)
  const speakingRef = useRef(false)
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const userIdRef = useRef(userId)
  userIdRef.current = userId
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const speakTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const removePeer = useCallback((id: number) => {
    const pc = pcRef.current.get(id)
    if (pc) {
      try {
        pc.close()
      } catch {}
      pcRef.current.delete(id)
    }
    setParticipants((prev) => {
      if (!prev.has(id)) return prev
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  const patchPeer = useCallback((id: number, patch: Partial<VoicePeer>) => {
    setParticipants((prev) => {
      const cur = prev.get(id)
      if (!cur) return prev
      const next = new Map(prev)
      next.set(id, { ...cur, ...patch })
      return next
    })
  }, [])

  // PeerConnection per remote user. Кандидаты шлём с явным target —
  // без этого ICE не сходится и звонок немой.
  const getOrCreatePc = useCallback(
    (remoteId: number) => {
      const existing = pcRef.current.get(remoteId)
      if (existing && existing.signalingState !== "closed") return existing
      if (existing) {
        try {
          existing.close()
        } catch {}
        pcRef.current.delete(remoteId)
      }
      const pc = new RTCPeerConnection(RTC_CONFIG)
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          wsRef.current?.readyState === WebSocket.OPEN &&
            wsRef.current.send(
              JSON.stringify({ type: "ice-candidate", target_id: remoteId, payload: event.candidate.toJSON() }),
            )
        }
      }
      pc.ontrack = (event) => {
        const remoteStream = event.streams[0]
        if (!remoteStream) return
        setParticipants((prev) => {
          const cur = prev.get(remoteId)
          const next = new Map(prev)
          next.set(remoteId, {
            stream: remoteStream,
            muted: cur?.muted ?? false,
            deafened: cur?.deafened ?? false,
            speaking: cur?.speaking ?? false,
          })
          return next
        })
      }
      const handleDown = () => removePeer(remoteId)
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed" || pc.iceConnectionState === "closed") {
          handleDown()
        }
      }
      pc.onsignalingstatechange = () => {
        if (pc.signalingState === "closed") handleDown()
      }
      pcRef.current.set(remoteId, pc)
      return pc
    },
    [removePeer],
  )

  const createOffer = useCallback(
    async (remoteId: number) => {
      if (remoteId === userIdRef.current) return
      try {
        const pc = getOrCreatePc(remoteId)
        const local = localRef.current
        if (local) {
          const senders = pc.getSenders().map((s) => s.track?.id)
          local.getTracks().forEach((track) => {
            if (!senders.includes(track.id)) pc.addTrack(track, local)
          })
        }
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        wsRef.current?.readyState === WebSocket.OPEN &&
          wsRef.current.send(JSON.stringify({ type: "offer", target_id: remoteId, payload: offer }))
      } catch (e) {
        console.error("createOffer failed:", e)
      }
    },
    [getOrCreatePc],
  )

  const handleOffer = useCallback(
    async (fromId: number, offer: RTCSessionDescriptionInit) => {
      try {
        const pc = getOrCreatePc(fromId)
        const local = localRef.current
        if (local) {
          const senders = pc.getSenders().map((s) => s.track?.id)
          local.getTracks().forEach((track) => {
            if (!senders.includes(track.id)) pc.addTrack(track, local)
          })
        }
        await pc.setRemoteDescription(offer)
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        wsRef.current?.readyState === WebSocket.OPEN &&
          wsRef.current.send(JSON.stringify({ type: "answer", target_id: fromId, payload: answer }))
      } catch (e) {
        console.error("handleOffer failed:", e)
      }
    },
    [getOrCreatePc],
  )

  const handleAnswer = useCallback(async (fromId: number, answer: RTCSessionDescriptionInit) => {
    try {
      const pc = pcRef.current.get(fromId)
      if (pc && pc.signalingState === "have-local-offer") {
        await pc.setRemoteDescription(answer)
      }
    } catch (e) {
      console.error("handleAnswer failed:", e)
    }
  }, [])

  const handleIceCandidate = useCallback(async (fromId: number, candidate: RTCIceCandidateInit) => {
    try {
      const pc = pcRef.current.get(fromId)
      if (pc && pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      }
    } catch (e) {
      console.error("handleIceCandidate failed:", e)
    }
  }, [])

  const stopSpeakingDetection = useCallback(() => {
    if (speakTimerRef.current) {
      clearInterval(speakTimerRef.current)
      speakTimerRef.current = null
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    analyserRef.current = null
    speakingRef.current = false
    setSpeaking(false)
  }, [])

  const startSpeakingDetection = useCallback(
    (stream: MediaStream) => {
      stopSpeakingDetection()
      try {
        const AC = window.AudioContext || (window as any).webkitAudioContext
        if (!AC) return
        const ctx = new AC()
        const src = ctx.createMediaStreamSource(stream)
        const an = ctx.createAnalyser()
        an.fftSize = 256
        src.connect(an)
        audioCtxRef.current = ctx
        analyserRef.current = an
        const dataArray = new Uint8Array(an.frequencyBinCount)
        speakTimerRef.current = setInterval(() => {
          if (!analyserRef.current) return
          analyserRef.current.getByteFrequencyData(dataArray)
          let sum = 0
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i]
          const isSpeaking = sum / dataArray.length > 30
          if (isSpeaking !== speakingRef.current) {
            speakingRef.current = isSpeaking
            setSpeaking(isSpeaking)
            wsRef.current?.readyState === WebSocket.OPEN &&
              wsRef.current.send(JSON.stringify({ type: "speaking", speaking: isSpeaking }))
          }
        }, 150)
      } catch (e) {
        console.error("speaking detection failed:", e)
      }
    },
    [stopSpeakingDetection],
  )

  const disconnect = useCallback(() => {
    stopSpeakingDetection()
    if (wsRef.current) {
      try {
        wsRef.current.close()
      } catch {}
      wsRef.current = null
    }
    pcRef.current.forEach((pc) => {
      try {
        pc.close()
      } catch {}
    })
    pcRef.current.clear()
    setParticipants(new Map())
    setNames(new Map())
    setConnected(false)
    const local = localRef.current
    if (local) {
      local.getTracks().forEach((t) => {
        try {
          t.stop()
        } catch {}
      })
      localRef.current = null
    }
    setLocalStream(null)
    mutedRef.current = false
    setMuted(false)
    speakingRef.current = false
    setSpeaking(false)
  }, [stopSpeakingDetection])

  const connect = useCallback(async () => {
    if (!enabledRef.current) return
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      })
      if (!enabledRef.current) {
        stream.getTracks().forEach((t) => {
          try {
            t.stop()
          } catch {}
        })
        return
      }
      localRef.current = stream
      setLocalStream(stream)

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
      const ws = new WebSocket(
        `${protocol}//${window.location.host}/ws/voice/${sessionId}?init_data=${encodeURIComponent(getInitData())}`,
      )
      wsRef.current = ws

      ws.onopen = () => {
        if (!enabledRef.current) {
          try {
            ws.close()
          } catch {}
          return
        }
        setConnected(true)
        // Кто уже в войсе — узнаём из REST (заодно ники/аватарки для списка)
        // и звоним им сами. Остальных покроют broadcast'ы user_joined с сервера.
        api
          .get<{ participants?: Array<{ user_id: number; nick?: string | null; avatar?: string | null }> }>(
            `/api/sessions/${sessionId}/voice/participants`,
          )
          .then((data) => {
            const list = (data?.participants ?? []).filter((p) => Number(p.user_id) && Number(p.user_id) !== userIdRef.current)
            setNames((prev) => {
              const next = new Map(prev)
              list.forEach((p) => {
                next.set(Number(p.user_id), { nick: p.nick ?? null, avatar: p.avatar ?? null })
              })
              return next
            })
            list.forEach((p) => void createOffer(Number(p.user_id)))
          })
          .catch(() => {})
      }

      ws.onmessage = (event) => {
        let data: any
        try {
          data = JSON.parse(event.data)
        } catch {
          return
        }
        if (!data || typeof data !== "object") return
        switch (data.type) {
          case "user_joined":
            if (Number(data.user_id) && Number(data.user_id) !== userIdRef.current) {
              void createOffer(Number(data.user_id))
            }
            break
          case "user_left":
            removePeer(Number(data.user_id))
            break
          case "offer":
            void handleOffer(Number(data.from_id), data.payload)
            break
          case "answer":
            void handleAnswer(Number(data.from_id), data.payload)
            break
          case "ice-candidate":
            void handleIceCandidate(Number(data.from_id), data.payload)
            break
          case "mute_changed":
            patchPeer(Number(data.user_id), { muted: !!data.muted })
            break
          case "deafen_changed":
            patchPeer(Number(data.user_id), { deafened: !!data.deafened })
            break
          case "speaking":
            patchPeer(Number(data.user_id), { speaking: !!data.speaking })
            break
          default:
            break
        }
      }

      ws.onclose = () => {
        setConnected(false)
      }
      ws.onerror = () => {
        setError("Connection error")
      }

      startSpeakingDetection(stream)
    } catch (err: any) {
      const name = err?.name || ""
      setError(name === "NotAllowedError" || name === "SecurityError" ? "mic-denied" : err?.message || "mic error")
      disconnect()
    }
  }, [sessionId, createOffer, handleOffer, handleAnswer, handleIceCandidate, removePeer, patchPeer, startSpeakingDetection, disconnect])

  const toggleMute = useCallback(() => {
    const local = localRef.current
    const next = !mutedRef.current
    mutedRef.current = next
    setMuted(next)
    local?.getAudioTracks().forEach((track) => {
      track.enabled = !next
    })
    wsRef.current?.readyState === WebSocket.OPEN && wsRef.current.send(JSON.stringify({ type: "mute", muted: next }))
  }, [])

  const toggleDeafen = useCallback(() => {
    setDeafened((prev) => {
      const next = !prev
      wsRef.current?.readyState === WebSocket.OPEN && wsRef.current.send(JSON.stringify({ type: "deafen", deafened: next }))
      return next
    })
  }, [])

  const clearError = useCallback(() => setError(null), [])

  useEffect(() => {
    if (enabled) {
      void connect()
    } else {
      disconnect()
    }
  }, [enabled, connect, disconnect])

  useEffect(() => {
    const d = disconnect
    return () => d()
  }, [disconnect])

  return {
    connected,
    participants,
    names,
    localStream,
    muted,
    deafened,
    speaking,
    error,
    clearError,
    toggleMute,
    toggleDeafen,
    wsConnected: connected,
  }
}
