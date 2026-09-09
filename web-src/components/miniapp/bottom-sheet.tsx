"use client"

import { useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

/** Общий нижний шит: плавное появление, серая ручка с drag.
 *  Потяни ручку вверх — развернётся (снапы 45/75/92% экрана),
 *  резко вниз или ниже 30% — закроется. Всё на transform/height (GPU),
 *  во время драга позиция пишется напрямую в DOM без ре-рендеров. */
export function BottomSheet({
  open,
  onClose,
  title,
  headerExtra,
  children,
  autoFitKey,
}: {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  headerExtra?: React.ReactNode
  children: React.ReactNode
  /** Перефитить высоту под контент при смене значения (напр. догрузка списка). */
  autoFitKey?: unknown
}) {
  const [render, setRender] = useState(open)
  const [closing, setClosing] = useState(false)
  const [height, setHeight] = useState<number | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startY: number; startH: number; lastY: number; lastT: number; moved: boolean } | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (open) {
      setRender(true)
      setClosing(false)
    }
  }, [open])

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    },
    [],
  )

  function fitToContent() {
    const el = boxRef.current
    if (!el || typeof window === "undefined") return
    setHeight(Math.min(el.scrollHeight, window.innerHeight * 0.78))
  }

  // Первичный фит по контенту после монтирования/открытия.
  useEffect(() => {
    if (!render || !open) return
    const raf = requestAnimationFrame(() => fitToContent())
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [render, open, autoFitKey])

  function requestClose() {
    if (closing) return
    setClosing(true)
    closeTimer.current = setTimeout(onClose, 220)
  }

  function onDown(e: React.PointerEvent) {
    const el = boxRef.current
    if (!el) return
    try {
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
    } catch {}
    drag.current = {
      startY: e.clientY,
      startH: el.getBoundingClientRect().height,
      lastY: e.clientY,
      lastT: performance.now(),
      moved: false,
    }
  }

  function onMove(e: React.PointerEvent) {
    const d = drag.current
    const el = boxRef.current
    if (!d || !el || typeof window === "undefined") return
    const dy = e.clientY - d.startY
    if (Math.abs(dy) > 8) d.moved = true
    if (!d.moved) return
    el.style.transition = "none"
    const vh = window.innerHeight
    el.style.height = `${Math.min(vh * 0.94, Math.max(140, d.startH - dy))}px`
    d.lastY = e.clientY
    d.lastT = performance.now()
  }

  function onUp(e: React.PointerEvent) {
    const d = drag.current
    const el = boxRef.current
    drag.current = null
    if (!el || !d || !d.moved || typeof window === "undefined") return
    el.style.transition = ""
    const vh = window.innerHeight
    const h = el.getBoundingClientRect().height
    const vel = (e.clientY - d.lastY) / Math.max(1, performance.now() - d.lastT)
    if (vel > 0.6 || h < vh * 0.3) {
      requestClose()
      return
    }
    const snaps = [vh * 0.45, vh * 0.75, vh * 0.92]
    setHeight(snaps.reduce((a, b) => (Math.abs(b - h) < Math.abs(a - h) ? b : a)))
  }

  if (!render) return null

  return (
    <div
      className={cn(
        "fixed inset-0 z-[70] flex items-end justify-center transition-opacity duration-200",
        closing ? "pointer-events-none opacity-0" : "opacity-100",
      )}
    >
      <button type="button" aria-label="Закрыть" onClick={requestClose} className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
      <div
        ref={boxRef}
        style={height != null ? { height: `${height}px` } : undefined}
        className={cn(
          "relative mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-t-3xl border-t border-border bg-card transition-[height,transform] duration-200 ease-out",
          closing ? "translate-y-full" : "translate-y-0",
        )}
      >
        <div className="shrink-0 bg-card">
          <div
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            className="cursor-grab touch-none px-5 pb-1 pt-3 active:cursor-grabbing"
          >
            <div className="mx-auto h-1.5 w-12 rounded-full bg-muted-foreground/30" />
          </div>
          <div className="flex items-center justify-between px-5 pb-2">
            {title ? <h2 className="font-display text-xl font-bold">{title}</h2> : <span />}
            <button
              type="button"
              onClick={requestClose}
              aria-label="Закрыть"
              className="grid size-8 place-items-center rounded-lg text-muted-foreground active:bg-secondary"
            >
              <X className="size-4" />
            </button>
          </div>
          {headerExtra}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-8 pt-1">{children}</div>
      </div>
    </div>
  )
}
