"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"

interface SignalingMessage {
  type: "offer" | "answer" | "ice-candidate" | "user_joined" | "user_left" | "mute_changed" | "deafen_changed" | "speaking" | "mute_changed" | "deafen_changed"
  from_id?: number
  target_id?: number
  user_id?: number
  payload?: RTCSessionDescriptionInit | RTCIceCandidateInit
  muted?: boolean
  deafened?: boolean
  speaking?: boolean
}

interface PeerConnectionState {
  pc: RTCPeerConnection
  remoteStream: MediaStream
}

export function useVoiceChat(sessionId: number, userId: number, enabled: boolean) {
  const [connected, setConnected] = useState(false)
  const [participants, setParticipants] = useState<Map<number, { stream: MediaStream; muted: boolean; deafened: boolean; speaking: boolean }>>(new Map())
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [muted, setMuted] = useState(false)
  const [deafened, setDeafened] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const pcMapRef = useRef<Map<number, RTCPeerConnection>>(new Map())
  const streamsRef = useRef<Map<number, MediaStream>>(new Map())
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const speakingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // STUN servers
  const rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
    iceCandidatePoolSize: 10,
  }

  // Get WebSocket URL
  const getWsUrl = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    const host = window.location.host
    return `${protocol}//${host}/ws/voice/${sessionId}`
  }, [sessionId])

  // Initialize local media stream
  const initLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      })
      setLocalStream(stream)
      return stream
    } catch (err) {
      console.error("Failed to get user media:", err)
      throw new Error("Microphone access denied")
    }
  }, [])

  // Create peer connection for a remote user
  const createPeerConnection = useCallback((remoteId: number) => {
    const pc = new RTCPeerConnection(rtcConfig)

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        wsRef.current?.send(JSON.stringify({
          type: "ice-candidate",
          target_id: event.candidate ? 0 : 0, // Will be set in sendSignal
          payload: event.candidate.toJSON(),
        }))
      }
    }

    pc.ontrack = (event) => {
      const remoteStream = event.streams[0]
      streamsRef.current.set(remoteId, remoteStream)
      setParticipants((prev) => {
        const next = new Map(prev)
        next.set(remoteId, { stream: remoteStream, muted: false, deafened: false, speaking: false })
        return next
      })
    }

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
        console.log(`ICE connection failed for ${remoteId}`)
        pcMapRef.current.delete(remoteId)
        streamsRef.current.delete(remoteId)
        setParticipants((prev) => {
          const next = new Map(prev)
          next.delete(remoteId)
          return next
        })
      }
    }

    pcMapRef.current.set(remoteId, pc)
    return pc
  }, [])

  // Send signaling message
  const sendSignal = useCallback((type: "offer" | "answer" | "ice-candidate", targetId: number, payload: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, target_id: targetId, payload }))
    }
  }, [])

  // Create offer for a remote user
  const createOffer = useCallback(async (remoteId: number) => {
    const pc = createPeerConnection(remoteId)
    if (localStream) {
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream))
    }
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    sendSignal("offer", remoteId, offer)
  }, [createPeerConnection, localStream, sendSignal])

  // Handle incoming offer
  const handleOffer = useCallback(async (fromId: number, offer: RTCSessionDescriptionInit) => {
    const pc = createPeerConnection(fromId)
    if (localStream) {
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream))
    }
    await pc.setRemoteDescription(offer)
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    wsRef.current?.send(JSON.stringify({ type: "answer", target_id: fromId, payload: answer }))
  }, [createPeerConnection, localStream])

  // Handle incoming answer
  const handleAnswer = useCallback(async (fromId: number, answer: RTCSessionDescriptionInit) => {
    const pc = pcMapRef.current.get(fromId)
    if (pc) {
      await pc.setRemoteDescription(answer)
    }
  }, [])

  // Handle ICE candidate
  const handleIceCandidate = useCallback(async (fromId: number, candidate: RTCIceCandidateInit) => {
    const pc = pcMapRef.current.get(fromId)
    if (pc) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate))
    }
  }, [])

  // Handle user joined
  const handleUserJoined = useCallback((userId: number) => {
    if (userId !== userId && connected) {
      createOffer(userId)
    }
  }, [connected])

  // Handle user left
  const handleUserLeft = useCallback((userId: number) => {
    const pc = pcMapRef.current.get(userId)
    if (pc) {
      pc.close()
      pcMapRef.current.delete(userId)
    }
    streamsRef.current.delete(userId)
    setParticipants((prev) => {
      const next = new Map(prev)
      next.delete(userId)
      return next
    })
  }, [])

  // Handle mute/deafen changes
  const handleMuteChanged = useCallback((userId: number, muted: boolean) => {
    setParticipants((prev) => {
      const next = new Map(prev)
      const p = next.get(userId)
      if (p) next.set(userId, { ...p, muted })
      return next
    })
  }, [])

  const handleDeafenChanged = useCallback((userId: number, deafened: boolean) => {
    setParticipants((prev) => {
      const next = new Map(prev)
      const p = next.get(userId)
      if (p) next.set(userId, { ...p, deafened })
      return next
    })
  }, [])

  // Handle speaking indicator
  const handleSpeaking = useCallback((userId: number, speaking: boolean) => {
    setParticipants((prev) => {
      const next = new Map(prev)
      const p = next.get(userId)
      if (p) next.set(userId, { ...p, speaking })
      return next
    })
  }, [])

  // Mute/unmute local
  const toggleMute = useCallback(async () => {
    if (!localStream) return
    const newMuted = !muted
    localStream.getAudioTracks().forEach((track) => (track.enabled = !newMuted))
    setMuted(newMuted)
    wsRef.current?.send(JSON.stringify({ type: "mute", muted: newMuted }))
  }, [localStream, muted])

  const toggleDeafen = useCallback(() => {
    setDeafened((prev) => {
      const next = !prev
      wsRef.current?.send(JSON.stringify({ type: "deafen", deafened: next }))
      return next
    })
  }, [])

  // Speaking detection
  const startSpeakingDetection = useCallback(() => {
    if (!localStream) return
    audioContextRef.current = new AudioContext()
    const source = audioContextRef.current.createMediaStreamSource(localStream)
    analyserRef.current = audioContextRef.current.createAnalyser()
    analyserRef.current.fftSize = 256
    source.connect(analyserRef.current)

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
    const THRESHOLD = 30 // Adjust sensitivity

    speakingIntervalRef.current = setInterval(() => {
      if (!analyserRef.current) return
      analyserRef.current.getByteFrequencyData(dataArray)
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
      const isSpeaking = avg > THRESHOLD
      if (isSpeaking !== speaking) {
        setSpeaking(isSpeaking)
        wsRef.current?.send(JSON.stringify({ type: "speaking", speaking: isSpeaking }))
      }
    }, 100)
  }, [speaking])

  const stopSpeakingDetection = useCallback(() => {
    if (speakingIntervalRef.current) {
      clearInterval(speakingIntervalRef.current)
      speakingIntervalRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    analyserRef.current = null
  }, [])

  // Connect to signaling WebSocket
  const connect = useCallback(async () => {
    if (!enabled) return
    setError(null)

    try {
      // Get local stream
      const stream = await initLocalStream()
      setLocalStream(stream)

      // Connect WebSocket
      const ws = new WebSocket(getWsUrl())
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        console.log("Voice WebSocket connected")
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          const type = data.type

          switch (type) {
            case "user_joined":
              if (data.user_id !== userId) {
                createOffer(data.user_id)
              }
              break
            case "user_left":
              setParticipants((prev) => {
                const next = new Map(prev)
                next.delete(data.user_id)
                return next
              })
              break
            case "offer":
              handleOffer(data.from_id, data.payload)
              break
            case "answer":
              handleAnswer(data.from_id, data.payload)
              break
            case "ice-candidate":
              handleIceCandidate(data.from_id, data.payload)
              break
            case "mute_changed":
              setParticipants((prev) => {
                const next = new Map(prev)
                const p = next.get(data.user_id)
                if (p) next.set(data.user_id, { ...p, muted: data.muted })
                return next
              })
              break
            case "deafen_changed":
              setParticipants((prev) => {
                const next = new Map(prev)
                const p = next.get(data.user_id)
                if (p) next.set(data.user_id, { ...p, deafened: data.deafened })
                return next
              })
              break
            case "speaking":
              setParticipants((prev) => {
                const next = new Map(prev)
                const p = next.get(data.user_id)
                if (p) next.set(data.user_id, { ...p, speaking: data.speaking })
                return next
              })
              break
            case "mute_changed":
            case "deafen_changed":
            case "speaking":
              // Handled above
              break
          }
        } catch (err) {
          console.error("WS message error:", err)
        }
      }

      ws.onclose = () => {
        setConnected(false)
        console.log("Voice WebSocket closed")
      }

      ws.onerror = (err) => {
        console.error("WS error:", err)
        setError("Connection error")
      }

      // Start speaking detection
      startSpeakingDetection()
    } catch (err: any) {
      setError(err.message)
    }
  }, [enabled, getWsUrl, initLocalStream])

  // Disconnect
  const disconnect = useCallback(() => {
    stopSpeakingDetection()
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    pcMapRef.current.forEach((pc) => pc.close())
    pcMapRef.current.clear()
    streamsRef.current.clear()
    setParticipants(new Map())
    setConnected(false)
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop())
      setLocalStream(null)
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
  }, [localStream])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  // Effect for enabled changes
  useEffect(() => {
    if (enabled) {
      connect()
    } else {
      disconnect()
    }
  }, [enabled, connect, disconnect])

  return {
    connected,
    participants,
    localStream,
    muted,
    deafened,
    speaking,
    error,
    toggleMute: () => {
      const audioTracks = localStream?.getAudioTracks()
      if (audioTracks) {
        const newMuted = !muted
        audioTracks.forEach((t) => (t.enabled = !newMuted))
        setMuted(newMuted)
        wsRef.current?.send(JSON.stringify({ type: "mute", muted: newMuted }))
      }
    },
    toggleDeafen: () => {
      const newDeafened = !deafened
      setDeafened(newDeafened)
      wsRef.current?.send(JSON.stringify({ type: "deafen", deafened: newDeafened }))
    },
    toggleSpeaking: () => setSpeaking((p) => {
      const next = !p
      wsRef.current?.send(JSON.stringify({ type: "speaking", speaking: next }))
      return next
    }),
    connected,
    participants,
    localStream,
    muted,
    deafened,
    speaking,
    error,
    clearError: () => setError(null),
  }
}