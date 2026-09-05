"use client"

import { useCallback, useEffect, useRef, useState } from "react"

const ADSGRAM_BLOCK_ID = "40994"
// Скрипт хостится локально — Telegram WebView блокирует загрузку со сторонних
// доменов (sad.adsgram.ai давал LOAD FAILED).
const ADSGRAM_SCRIPT = "/adsgram-sad.min.js"

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

function reportSdkDiag(msg: string) {
  try {
    const apiBase = (window as any)._ab || ""
    const body = JSON.stringify({
      message: msg,
      stack: "",
      componentStack: "",
      tab: "cases",
      url: location.href,
    })
    navigator.sendBeacon(apiBase + "/api/client-error", new Blob([body], { type: "application/json" }))
  } catch {
    // ignore
  }
}

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
    s.onload = () => {
      resolve()
    }
    s.onerror = () => {
      reportSdkDiag("adsgram script LOAD FAILED")
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
          reportSdkDiag("adsgram loaded but window.Adsgram.init missing (attempt " + (attempt + 1) + ")")
        } catch (e: any) {
          reportSdkDiag("adsgram init error attempt " + (attempt + 1) + ": " + (typeof e === "object" ? JSON.stringify(e) : String(e?.message || e)))
        }
        await new Promise((r) => setTimeout(r, 1500))
      }
      if (!cancelled) reportSdkDiag("adsgram init GAVE UP after 6 attempts")
    }
    init()
    return () => {
      cancelled = true
      ctrlRef.current?.destroy()
      ctrlRef.current = null
    }
  }, [])

  const showAd = useCallback(async (): Promise<boolean> => {
    if (!ctrlRef.current) {
      reportSdkDiag("showAd called but controller missing")
      return false
    }
    try {
      const t0 = Date.now()
      const result = await ctrlRef.current.show()
      const elapsed = Date.now() - t0
      // Полный слепок ответа SDK: видно, была ли реклама вообще
      // (done/state/error), а не только итог boolean.
      try {
        reportSdkDiag(
          "adsgram show result done=" + String((result as any)?.done) +
          " state=" + String((result as any)?.state) +
          " error=" + String((result as any)?.error) +
          " elapsed_ms=" + String(elapsed) +
          " desc=" + String((result as any)?.description ?? "").slice(0, 120),
        )
      } catch {}
      if (!result.done) return false
      // Защита от мгновенного done=true: ролик физически нельзя
      // досмотреть быстрее ~3с. Такое — не просмотр, кейс не открываем.
      if (elapsed < 3000) {
        try {
          reportSdkDiag("adsgram too-fast done=true elapsed_ms=" + String(elapsed) + " treated as not watched")
        } catch {}
        return false
      }
      onRewardRef.current()
      return true
    } catch (err: any) {
      reportSdkDiag("adsgram show threw: " + (typeof err === "object" ? JSON.stringify(err) : String(err?.message || err)))
      onErrorRef.current?.(err)
      return false
    }
  }, [])

  return { showAd, ready }
}
