"use client"

import { useState } from "react"
import { Link2, Eye, EyeOff, ShieldAlert } from "lucide-react"
import { openTelegramLink } from "@/lib/api"
import { hapticTap } from "@/lib/webapp"
import { cn } from "@/lib/utils"

const URL_RE = /(https?:\/\/[^\s<>"']+|t\.me\/[^\s<>"']+|telegram\.me\/[^\s<>"']+|@[A-Za-z0-9_]{4,})/gi
const BARE_DOMAIN_RE = /\b((?:[a-z0-9-]+\.)+(?:com|ru|net|org|io|gg|xyz|top|su|by|ua|kz|dev|app|ly|me|tv)\b(?:\/[^\s<>"']*)?)/gi

const TRUSTED = ["t.me/TeamUpMatchBot", "teamfinder", "render.com"]

function isTrusted(url: string): boolean {
  const low = url.toLowerCase()
  return TRUSTED.some((w) => low.includes(w.toLowerCase()))
}

function looksScammy(url: string): boolean {
  const low = url.toLowerCase()
  return /free|gift|giveaway|airdrop|crypto.*double|steam.*free|nitro|bonus|promo.*code|click.*win/i.test(low) && !isTrusted(url)
}

type Part = { kind: "text"; text: string } | { kind: "link"; url: string; display: string }

function splitLinks(text: string): Part[] {
  const parts: Part[] = []
  const re = new RegExp(`${URL_RE.source}|${BARE_DOMAIN_RE.source}`, "gi")
  let last = 0
  let m: RegExpExecArray | null
  // защита от ReDoS: максимум 20 ссылок на сообщение
  let count = 0
  while ((m = re.exec(text)) !== null && count < 20) {
    count++
    const url = m[0]
    const idx = m.index
    if (idx > last) parts.push({ kind: "text", text: text.slice(last, idx) })
    let full = url
    if (!/^https?:\/\//i.test(full) && !/^t\.me\//i.test(full) && !/^telegram\.me\//i.test(full) && !/^@/.test(full)) {
      full = "https://" + full
    }
    parts.push({ kind: "link", url: full, display: url.length > 40 ? url.slice(0, 40) + "…" : url })
    last = idx + url.length
    if (url.length === 0) re.lastIndex++
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) })
  if (parts.length === 0) parts.push({ kind: "text", text })
  return parts
}

/** Текст сообщения со скрытыми сырыми ссылками:
 *  - ссылка рендерится как компактная пилюля [🔗 ссылка], а не кринж-портянка;
 *  - по умолчанию скрыта за тапом (антискам), доверенные открываются сразу;
 *  - скам-подозрительные подсвечены красным + предупреждение.
 */
export function SafeText({ text, mine, className }: { text: string; mine?: boolean; className?: string }) {
  const [revealed, setRevealed] = useState(false)
  const parts = splitLinks(text || "")
  const hasLink = parts.some((p) => p.kind === "link")
  if (!hasLink) {
    return <span className={className}>{text}</span>
  }
  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (p.kind === "text") return <span key={i}>{p.text}</span>
        const scam = looksScammy(p.url)
        const trusted = isTrusted(p.url)
        if (!revealed && !trusted) {
          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                hapticTap()
                setRevealed(true)
              }}
              className={cn(
                "mx-0.5 inline-flex max-w-full items-center gap-1 rounded-lg border px-1.5 py-0.5 align-baseline text-[12px] font-semibold active:scale-95",
                scam ? "border-red-500/50 bg-red-500/10 text-red-500" : "border-accent/40 bg-accent/10 text-accent",
              )}
            >
              {scam ? <ShieldAlert className="size-3 shrink-0" /> : <EyeOff className="size-3 shrink-0" />}
              <span className="truncate">🔗 {scam ? "подозрительная ссылка" : "ссылка"}
              </span>
            </button>
          )
        }
        return (
          <span key={i} className="inline-flex max-w-full items-center gap-1">
            <button
              type="button"
              onClick={() => {
                hapticTap()
                try {
                  if (p.url.startsWith("@")) {
                    openTelegramLink("https://t.me/" + p.url.slice(1))
                  } else {
                    openTelegramLink(p.url)
                  }
                } catch {}
              }}
              title={p.url}
              className={cn(
                "mx-0.5 inline-flex max-w-[180px] items-center gap-1 rounded-lg border px-1.5 py-0.5 align-baseline text-[12px] font-semibold underline decoration-dotted underline-offset-2 active:scale-95",
                scam
                  ? "border-red-500/50 bg-red-500/10 text-red-500"
                  : mine
                    ? "border-primary-foreground/40 bg-primary-foreground/10 text-primary-foreground"
                    : "border-accent/40 bg-accent/10 text-accent",
              )}
            >
              <Link2 className="size-3 shrink-0" />
              <span className="truncate">{p.display}</span>
            </button>
            {!trusted && (
              <button
                type="button"
                onClick={() => {
                  hapticTap()
                  setRevealed(false)
                }}
                aria-label="hide"
                className="inline-grid size-5 shrink-0 place-items-center rounded-md text-muted-foreground/60 active:scale-90"
              >
                <Eye className="size-3" />
              </button>
            )}
          </span>
        )
      })}
    </span>
  )
}
