"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"

declare global {
  interface Window {
    __NEXUS_TAB?: string
  }
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || ""

function sendError(message: string, stack: string | undefined, componentStack: string | undefined) {
  const payload = {
    message,
    stack: stack || "",
    componentStack: componentStack || "",
    tab: typeof window !== "undefined" ? window.__NEXUS_TAB || "unknown" : "unknown",
    url: typeof window !== "undefined" ? window.location.href : "",
  }
  try {
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" })
    navigator.sendBeacon(`${API_BASE}/api/client-error`, blob)
  } catch {}
}

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    sendError(error.message, error.stack, info.componentStack || "")
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 text-center">
          <h1 className="font-display text-2xl font-bold text-foreground">Что-то пошло не так</h1>
          <p className="mt-2 text-sm text-muted-foreground">Произошла непредвиденная ошибка. Попробуйте обновить страницу.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 rounded-2xl bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground active:scale-95"
          >
            Обновить
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
