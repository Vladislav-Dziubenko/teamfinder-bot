"use client"

import { useEffect, useState } from "react"

type AvatarImageProps = {
  src?: string | null
  alt: string
  className: string
}

/** Shows a useful fallback if an external Telegram/Discord/Steam image fails. */
export function AvatarImage({ src, alt, className }: AvatarImageProps) {
  const [failed, setFailed] = useState(false)

  useEffect(() => setFailed(false), [src])

  if (!src || failed) {
    return (
      <div role="img" aria-label={alt} className={`${className} grid place-items-center bg-primary/20 font-display font-bold text-primary`}>
        {(alt.trim().charAt(0) || "?").toUpperCase()}
      </div>
    )
  }

  return <img src={src} alt={alt} className={className} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
}
