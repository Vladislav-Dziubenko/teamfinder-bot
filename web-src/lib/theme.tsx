"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"

export type Theme = "dark" | "light"

const STORAGE_KEY = "nexus-theme"

interface ThemeCtx {
  theme: Theme
  setTheme: (t: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeCtx>({
  theme: "dark",
  setTheme: () => {},
  toggleTheme: () => {},
})

function applyTheme(t: Theme) {
  const root = document.documentElement
  if (t === "light") root.setAttribute("data-theme", "light")
  else root.removeAttribute("data-theme")
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark")

  useEffect(() => {
    let t: Theme = "dark"
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved === "light" || saved === "dark") t = saved
    } catch {
      /* noop */
    }
    setThemeState(t)
    applyTheme(t)
  }, [])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    applyTheme(t)
    try {
      localStorage.setItem(STORAGE_KEY, t)
    } catch {
      /* noop */
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark"
      applyTheme(next)
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        /* noop */
      }
      return next
    })
  }, [])

  return <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
