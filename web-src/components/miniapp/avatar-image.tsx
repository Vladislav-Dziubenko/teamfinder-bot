"use client"

import { useEffect, useState } from "react"

type AvatarImageProps = {
  src?: string | null
  /** Запасной URL: пробуем один раз, если src мёртв
   *  (протухший userpic Telegram и т.п.). */
  fallbackSrc?: string | null
  alt: string
  className: string
}

/** Свежее фото Telegram из initData (генерится при каждом запуске,
 *  в отличие от сохранённого userpic-URL, который протухает). */
export function getTelegramPhotoUrl(): string | null {
  try {
    const url = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.photo_url
    return typeof url === "string" && url ? url : null
  } catch {
    return null
  }
}

/** Shows a useful fallback if an external Telegram/Discord/Steam image fails.
 *  Порядок: src -> fallbackSrc -> буква ника (битую иконку + alt-текст
 *  пользователь не увидит никогда). */
export function AvatarImage({ src, fallbackSrc, alt, className }: AvatarImageProps) {
  const [stage, setStage] = useState(0)

  useEffect(() => setStage(0), [src, fallbackSrc])

  const current = stage === 0 ? src || fallbackSrc : stage === 1 ? fallbackSrc : undefined
  if (!current) {
    return (
      <div role="img" aria-label={alt} className={`${className} grid place-items-center bg-primary/20 font-display font-bold text-primary`}>
        {(alt.trim().charAt(0) || "?").toUpperCase()}
      </div>
    )
  }

  return (
    <img
      src={current}
      alt={alt}
      className={className}
      referrerPolicy="no-referrer"
      onError={() => {
        // src сдох: один шанс на fallbackSrc, дальше — буква.
        if (stage === 0 && fallbackSrc && fallbackSrc !== src) setStage(1)
        else setStage(2)
      }}
    />
  )
}
