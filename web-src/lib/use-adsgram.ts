"use client"

import { useCallback, useEffect, useRef } from "react"

const ADSGRAM_BLOCK_ID = "40994"

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

export function useAdsgram(onReward: () => void, onError?: (err: any) => void) {
  const ctrlRef = useRef<AdController | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      ctrlRef.current = window.Adsgram?.init({ blockId: ADSGRAM_BLOCK_ID }) ?? null
    } catch {
      ctrlRef.current = null
    }
    return () => {
      ctrlRef.current?.destroy()
      ctrlRef.current = null
    }
  }, [])

  const showAd = useCallback(async (): Promise<boolean> => {
    if (!ctrlRef.current) return false
    try {
      const result = await ctrlRef.current.show()
      if (result.done) {
        onReward()
        return true
      }
      return false
    } catch (err) {
      onError?.(err)
      return false
    }
  }, [onReward, onError])

  return showAd
}
