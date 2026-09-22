"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { api } from "@/lib/api"

// Только ru + en загружаются в стартовый бандл (fallback и SSR).
// Остальные 43 словаря грузятся динамически при выборе языка —
// это убирает ~1.6 МБ локалей из первого экрана.
import ru from "@/locales/ru.json"
import en from "@/locales/en.json"

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
  { code: "be", name: "Belarusian", nativeName: "Беларуская" },
  { code: "bg", name: "Bulgarian", nativeName: "Български" },
  { code: "et", name: "Estonian", nativeName: "Eesti" },
  { code: "hr", name: "Croatian", nativeName: "Hrvatski" },
  { code: "lt", name: "Lithuanian", nativeName: "Lietuvių" },
  { code: "lv", name: "Latvian", nativeName: "Latviešu" },
  { code: "mk", name: "Macedonian", nativeName: "Македонски" },
  { code: "sk", name: "Slovak", nativeName: "Slovenčina" },
  { code: "sl", name: "Slovenian", nativeName: "Slovenščina" },
  { code: "sr", name: "Serbian", nativeName: "Српски" },
  { code: "kk", name: "Kazakh", nativeName: "Қазақша" },
  { code: "uz", name: "Uzbek", nativeName: "O'zbek" },
]

const dictionaries: Record<string, Record<string, string>> = {
  ru, en,
}

// Динамические словари — грузятся по требованию и кэшируются.
// Явная карта вместо переменного import(`@/locales/${code}.json`):
// Turbopack не всегда собирает чанки по шаблонной строке, и язык
// молча оставался на русском (кейс kk/uz). Статические импорты
// гарантируют чанк под каждую локаль.
const localeLoaders: Record<string, () => Promise<any>> = {
  es: () => import("@/locales/es.json"),
  pt: () => import("@/locales/pt.json"),
  de: () => import("@/locales/de.json"),
  fr: () => import("@/locales/fr.json"),
  tr: () => import("@/locales/tr.json"),
  ar: () => import("@/locales/ar.json"),
  uk: () => import("@/locales/uk.json"),
  pl: () => import("@/locales/pl.json"),
  zh: () => import("@/locales/zh.json"),
  hi: () => import("@/locales/hi.json"),
  id: () => import("@/locales/id.json"),
  it: () => import("@/locales/it.json"),
  ja: () => import("@/locales/ja.json"),
  ko: () => import("@/locales/ko.json"),
  nl: () => import("@/locales/nl.json"),
  vi: () => import("@/locales/vi.json"),
  th: () => import("@/locales/th.json"),
  fa: () => import("@/locales/fa.json"),
  ms: () => import("@/locales/ms.json"),
  sv: () => import("@/locales/sv.json"),
  no: () => import("@/locales/no.json"),
  da: () => import("@/locales/da.json"),
  fi: () => import("@/locales/fi.json"),
  cs: () => import("@/locales/cs.json"),
  ro: () => import("@/locales/ro.json"),
  hu: () => import("@/locales/hu.json"),
  el: () => import("@/locales/el.json"),
  he: () => import("@/locales/he.json"),
  ur: () => import("@/locales/ur.json"),
  bn: () => import("@/locales/bn.json"),
  ta: () => import("@/locales/ta.json"),
  tl: () => import("@/locales/tl.json"),
  az: () => import("@/locales/az.json"),
  be: () => import("@/locales/be.json"),
  bg: () => import("@/locales/bg.json"),
  et: () => import("@/locales/et.json"),
  hr: () => import("@/locales/hr.json"),
  lt: () => import("@/locales/lt.json"),
  lv: () => import("@/locales/lv.json"),
  mk: () => import("@/locales/mk.json"),
  sk: () => import("@/locales/sk.json"),
  sl: () => import("@/locales/sl.json"),
  sr: () => import("@/locales/sr.json"),
  kk: () => import("@/locales/kk.json"),
  uz: () => import("@/locales/uz.json"),
}

function reportDictError(code: string, err: unknown): void {
  try {
    const msg = `i18n dict load failed: ${code} ${String((err as any)?.message || err).slice(0, 120)}`
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/client-error",
        new Blob([JSON.stringify({ message: msg, tab: "settings", url: location.href })], {
          type: "application/json",
        }),
      )
    }
  } catch {}
}

// Языки с неполным переводом падают сначала на русский (аудитория СНГ),
// потом на английский, потом на сам ключ.
const RU_FALLBACK_LANGS = new Set(["kk", "uz"])

const lazyDicts = new Map<string, Promise<Record<string, string> | undefined>>()

function loadDict(code: string): Promise<Record<string, string> | undefined> {
  if (dictionaries[code]) return Promise.resolve(dictionaries[code])
  const loader = localeLoaders[code]
  if (!loader) return Promise.resolve(undefined)
  let p = lazyDicts.get(code)
  if (!p) {
    p = loader()
      .then((m) => {
        const dict = (m?.default ?? m) as Record<string, string>
        if (!dict || typeof dict !== "object") {
          // Не кэшируем провал — следующая попытка попробует снова.
          lazyDicts.delete(code)
          reportDictError(code, "bad dict shape")
          return undefined
        }
        return dict
      })
      .catch((e) => {
        // Не кэшируем провал — иначе язык залипает на русском до перезапуска.
        lazyDicts.delete(code)
        reportDictError(code, e)
        return undefined
      })
    lazyDicts.set(code, p)
  }
  return p
}

const STORAGE_KEY = "nexus-lang"
const DEFAULT_LANG = "ru"

// Коды языков Telegram/браузера → наши локали (ru, en, es, pt, de, fr, tr, ar,
// uk, pl, zh, hi, id, it, ja, ko, nl, vi, th, fa, ms, sv, no, da, fi, cs, ro,
// hu, el, he, ur, bn, ta, tl, az, be, bg, et, hr, lt, lv, mk, sk, sl, sr,
// kk, uz; mo = молдавский → румынский).
const LANG_ALIASES: Record<string, string> = {
  "pt-br": "pt", "pt-pt": "pt", "zh-cn": "zh", "zh-tw": "zh", "zh-hans": "zh", "zh-hant": "zh",
  "en-us": "en", "en-gb": "en", "es-es": "es", "es-mx": "es", "es-ar": "es",
  "fr-fr": "fr", "de-de": "de", "it-it": "it", "nl-nl": "nl", "sv-se": "sv",
  "no-no": "no", "da-dk": "da", "fi-fi": "fi", "cs-cz": "cs", "ro-ro": "ro",
  "ro-md": "ro", "mo": "ro", "mo-md": "ro",
  "hu-hu": "hu", "el-gr": "el", "tr-tr": "tr", "ar-sa": "ar", "he-il": "he",
  "fa-ir": "fa", "ur-pk": "ur", "bn-bd": "bn", "ta-in": "ta", "tl-ph": "tl",
  "az-az": "az", "pl-pl": "pl", "uk-ua": "uk", "ru-ru": "ru", "vi-vn": "vi",
  "th-th": "th", "ms-my": "ms", "id-id": "id", "ja-jp": "ja", "ko-kr": "ko",
  "hi-in": "hi", "iw": "he", "fil": "tl", "in": "id",
  "be-by": "be", "bg-bg": "bg", "et-ee": "et", "hr-hr": "hr", "lt-lt": "lt",
  "lv-lv": "lv", "mk-mk": "mk", "sk-sk": "sk", "sl-si": "sl", "sr-rs": "sr",
  "sr-cyrl": "sr", "sr-latn": "sr", "srb": "sr",
  "kk-kz": "kk", "uz-uz": "uz",
}

// Все поддерживаемые коды (встроенные словари + ленивые). Автоопределение
// раньше смотрело только на встроенные ru/en — остальные языки никогда
// не выбирались автоматически и все падали на русский по умолчанию.
const SUPPORTED_LANGS = new Set(LANGUAGES.map((l) => l.code))

function normalizeLangCode(code?: string | null): string | undefined {
  if (!code) return undefined
  const c = code.trim().toLowerCase().replace(/_/g, "-")
  if (dictionaries[c] || SUPPORTED_LANGS.has(c)) return c
  if (LANG_ALIASES[c]) return LANG_ALIASES[c]
  const base = c.split("-")[0]
  if (dictionaries[base] || SUPPORTED_LANGS.has(base)) return base
  if (LANG_ALIASES[base]) return LANG_ALIASES[base]
  return undefined
}

function detectLang(): string | undefined {
  try {
    const u = window.Telegram?.WebApp?.initDataUnsafe?.user
    const fromTg = normalizeLangCode(u?.language_code)
    if (fromTg) return fromTg
    const fromNav = normalizeLangCode(navigator.language)
    if (fromNav) return fromNav
  } catch {}
  return undefined
}

interface I18nContextValue {
  lang: string
  setLang: (code: string) => void
  t: (key: string, vars?: Record<string, string | number>) => string
  tl: (key: string, fallback: string) => string
  ready: boolean
}

const I18nContext = createContext<I18nContextValue>({
  lang: DEFAULT_LANG,
  setLang: () => {},
  t: (key) => key,
  tl: (_key, fallback) => fallback,
  ready: false,
})

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<string>(DEFAULT_LANG)
  const [ready, setReady] = useState(false)
  const [extraDicts, setExtraDicts] = useState<Record<string, Record<string, string>>>({})

  useEffect(() => {
    let initial = DEFAULT_LANG
    let chosen = false
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && dictionaries[saved]) {
        initial = saved
        chosen = true
      } else if (saved) {
        // Язык сохранён, но словарь ещё не загружен — подхватим его.
        initial = saved
        chosen = true
      }
    } catch {}
    if (!chosen) {
      // Автоопределение: язык Telegram (язык клиента игрока) → язык браузера.
      initial = detectLang() ?? DEFAULT_LANG
    }
    setLangState(initial)
    if (!dictionaries[initial]) {
      void loadDict(initial).then((d) => {
        if (d) setExtraDicts((prev) => ({ ...prev, [initial]: d }))
      })
    }
    setReady(true)
    void api.post("/api/user/language", { lang: initial }).catch(() => {})
    if (!chosen) {
      // Если на сервере уже сохранён явный выбор языка (например, игрок менял
      // язык в другом мини-аппе/бот ранее) — уважаем его поверх автоопределения.
      void api
        .get<{ lang?: string }>("/api/user/language")
        .then((res) => {
          const serverLang = normalizeLangCode(res?.lang)
          if (serverLang && serverLang !== initial) {
            setLangState(serverLang)
            if (!dictionaries[serverLang]) {
              void loadDict(serverLang).then((d) => {
                if (d) setExtraDicts((prev) => ({ ...prev, [serverLang]: d }))
              })
            }
            try {
              localStorage.setItem(STORAGE_KEY, serverLang)
            } catch {}
            void api.post("/api/user/language", { lang: serverLang }).catch(() => {})
          }
        })
        .catch(() => {})
    }
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
    if (!dictionaries[code] && !localeLoaders[code] && !LANGUAGES.some((l) => l.code === code)) return
    setLangState(code)
    if (!dictionaries[code]) {
      void loadDict(code).then((d) => {
        if (d) setExtraDicts((prev) => ({ ...prev, [code]: d }))
      })
    }
    try {
      localStorage.setItem(STORAGE_KEY, code)
    } catch {}
    void api.post("/api/user/language", { lang: code }).catch(() => {})
  }, [])

  // Цепочка фолбэков: язык → (ru для kk/uz) → en → ru → ключ.
  // typeof-проверка заодно лечит вложенные объекты в словарях.
  const lookup = useCallback(
    (key: string): string | undefined => {
      const chain: Array<Record<string, string> | undefined> = [
        extraDicts[lang],
        dictionaries[lang],
        ...(RU_FALLBACK_LANGS.has(lang) ? [dictionaries["ru"]] : []),
        dictionaries["en"],
        dictionaries[DEFAULT_LANG],
      ]
      for (const d of chain) {
        const v = d?.[key]
        if (typeof v === "string" && v !== key) return v
      }
      return undefined
    },
    [lang, extraDicts],
  )

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let str = lookup(key)
      if (str === undefined) {
        console.warn("[i18n] missing key:", key, "lang:", lang)
        str = key
      }
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v))
        }
      }
      return str
    },
    [lang, lookup],
  )

  // Перевод серверных текстов (кейсы, предметы, роли и т.п.): берём перевод
  // из словаря, если ключ есть, иначе — оригинальный текст с сервера.
  const tl = useCallback(
    (key: string, fallback: string) => {
      return lookup(key) ?? fallback
    },
    [lookup],
  )

  const value = useMemo(() => ({ lang, setLang, t, tl, ready }), [lang, setLang, t, tl, ready, extraDicts])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}
