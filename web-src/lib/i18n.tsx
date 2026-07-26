"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { api } from "@/lib/api"

import ru from "@/locales/ru.json"
import en from "@/locales/en.json"
import es from "@/locales/es.json"
import pt from "@/locales/pt.json"
import de from "@/locales/de.json"
import fr from "@/locales/fr.json"
import tr from "@/locales/tr.json"
import ar from "@/locales/ar.json"
import uk from "@/locales/uk.json"
import pl from "@/locales/pl.json"
import zh from "@/locales/zh.json"
import hi from "@/locales/hi.json"
import id from "@/locales/id.json"
import it from "@/locales/it.json"
import ja from "@/locales/ja.json"
import ko from "@/locales/ko.json"
import nl from "@/locales/nl.json"
import vi from "@/locales/vi.json"
import th from "@/locales/th.json"
import fa from "@/locales/fa.json"
import ms from "@/locales/ms.json"
import sv from "@/locales/sv.json"
import no from "@/locales/no.json"
import da from "@/locales/da.json"
import fi from "@/locales/fi.json"
import cs from "@/locales/cs.json"
import ro from "@/locales/ro.json"
import hu from "@/locales/hu.json"
import el from "@/locales/el.json"
import he from "@/locales/he.json"
import ur from "@/locales/ur.json"
import bn from "@/locales/bn.json"
import ta from "@/locales/ta.json"
import tl from "@/locales/tl.json"
import az from "@/locales/az.json"

export type LangCode = string

export interface LanguageOption {
  code: string
  name: string
  nativeName: string
  rtl?: boolean
}

export const LANGUAGES: LanguageOption[] = [
  { code: "ru", name: "Russian", nativeName: "Русский" },
  { code: "en", name: "English", nativeName: "English" },
  { code: "es", name: "Spanish", nativeName: "Español" },
  { code: "pt", name: "Portuguese", nativeName: "Português" },
  { code: "de", name: "German", nativeName: "Deutsch" },
  { code: "fr", name: "French", nativeName: "Français" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe" },
  { code: "ar", name: "Arabic", nativeName: "العربية", rtl: true },
  { code: "uk", name: "Ukrainian", nativeName: "Українська" },
  { code: "pl", name: "Polish", nativeName: "Polski" },
  { code: "zh", name: "Chinese", nativeName: "中文" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
  { code: "id", name: "Indonesian", nativeName: "Indonesia" },
  { code: "it", name: "Italian", nativeName: "Italiano" },
  { code: "ja", name: "Japanese", nativeName: "日本語" },
  { code: "ko", name: "Korean", nativeName: "한국어" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands" },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt" },
  { code: "th", name: "Thai", nativeName: "ไทย" },
  { code: "fa", name: "Persian", nativeName: "فارسی", rtl: true },
  { code: "ms", name: "Malay", nativeName: "Melayu" },
  { code: "sv", name: "Swedish", nativeName: "Svenska" },
  { code: "no", name: "Norwegian", nativeName: "Norsk" },
  { code: "da", name: "Danish", nativeName: "Dansk" },
  { code: "fi", name: "Finnish", nativeName: "Suomi" },
  { code: "cs", name: "Czech", nativeName: "Čeština" },
  { code: "ro", name: "Romanian", nativeName: "Română" },
  { code: "hu", name: "Hungarian", nativeName: "Magyar" },
  { code: "el", name: "Greek", nativeName: "Ελληνικά" },
  { code: "he", name: "Hebrew", nativeName: "עברית", rtl: true },
  { code: "ur", name: "Urdu", nativeName: "اردو", rtl: true },
  { code: "bn", name: "Bengali", nativeName: "বাংলা" },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்" },
  { code: "tl", name: "Filipino", nativeName: "Filipino" },
  { code: "az", name: "Azerbaijani", nativeName: "Azərbaycan" },
]

const dictionaries: Record<string, Record<string, string>> = {
  ru, en, es, pt, de, fr, tr, ar, uk, pl, zh, hi, id, it, ja, ko, nl, vi, th, fa,
  ms, sv, no, da, fi, cs, ro, hu, el, he, ur, bn, ta, tl, az,
}

const STORAGE_KEY = "nexus-lang"
const DEFAULT_LANG = "ru"

interface I18nContextValue {
  lang: string
  setLang: (code: string) => void
  t: (key: string, vars?: Record<string, string | number>) => string
  ready: boolean
}

const I18nContext = createContext<I18nContextValue>({
  lang: DEFAULT_LANG,
  setLang: () => {},
  t: (key) => key,
  ready: false,
})

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<string>(DEFAULT_LANG)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let initial = DEFAULT_LANG
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && dictionaries[saved]) initial = saved
    } catch {}
    setLangState(initial)
    setReady(true)
    void api.post("/api/user/language", { lang: initial }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!ready) return
    const meta = LANGUAGES.find((l) => l.code === lang)
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang
      document.documentElement.dir = meta?.rtl ? "rtl" : "ltr"
    }
  }, [lang, ready])

  const setLang = useCallback((code: string) => {
    if (!dictionaries[code]) return
    setLangState(code)
    try {
      localStorage.setItem(STORAGE_KEY, code)
    } catch {}
    void api.post("/api/user/language", { lang: code }).catch(() => {})
  }, [])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const dict = dictionaries[lang] || dictionaries[DEFAULT_LANG]
      let str = dict[key] ?? dictionaries[DEFAULT_LANG][key] ?? key
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v))
        }
      }
      return str
    },
    [lang],
  )

  const value = useMemo(() => ({ lang, setLang, t, ready }), [lang, setLang, t, ready])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}
