"use client"

import { useCallback, useEffect, useRef, useState } from "react"

const ADSGRAM_BLOCK_ID = "40994"
const ADSGRAM_SCRIPT = "https://sad.adsgram.ai/js/sad.min.js"

type AdController = {
  show: () => Promise<{ done: boolean; description: string; state: string; error: boolean }>
  destroy: () => void
}

declare global {
  interface Window {
    Adsgram?: {
      init: (opts: { blockId: string; debug?: boolean }) => AdController
    }
  }
}

// Грузим скрипт AdsGram динамически после того, как Telegram WebApp
// инициализировался. beforeInteractive в Telegram WebView блокируется —
// скрипт рекламы должен подгружаться как обычный script-тег.
let scriptPromise: Promise<void> | null = null

function loadAdsgramScript(): Promise<void> {
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && window.Adsgram?.init) {
      resolve()
      return
    }
    const s = document.createElement("script")
    s.src = ADSGRAM_SCRIPT
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      scriptPromise = null
      reject(new Error("Adsgram script failed to load"))
    }
    document.head.appendChild(s)
  })
  return scriptPromise
}

export function useAdsgram(onReward: () => void, onError?: (err: any) => void) {
  const [ready, setReady] = useState(false)
  const ctrlRef = useRef<AdController | null>(null)
  const onRewardRef = useRef(onReward)
  const onErrorRef = useRef(onError)
  onRewardRef.current = onReward
  onErrorRef.current = onError

  useEffect(() => {
    let cancelled = false
    async function init() {
      for (let attempt = 0; attempt < 6 && !cancelled; attempt++) {
        try {
          await loadAdsgramScript()
          if (cancelled) return
          if (window.Adsgram?.init) {
            ctrlRef.current = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID })
            setReady(true)
            return
          }
        } catch {
          // не загрузилось — ретраим
        }
        await new Promise((r) => setTimeout(r, 1500))
      }
    }
    init()
    return () => {
      cancelled = true
      ctrlRef.current?.destroy()
      ctrlRef.current = null
    }
  }, [])

  const showAd = useCallback(async (): Promise<boolean> => {
    if (!ctrlRef.current) return false
    try {
      const result = await ctrlRef.current.show()
      if (result.done) {
        onRewardRef.current()
        return true
      }
      return false
    } catch (err) {
      onErrorRef.current?.(err)
      return false
    }
  }, [])

  return { showAd, ready }
}
