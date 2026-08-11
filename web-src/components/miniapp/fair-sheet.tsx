"use client"

import { useEffect, useState } from "react"
import { ShieldCheck, ShieldX, Loader2, X, Hourglass } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { verifyCaseProof, type FairProof, type CaseItemForVerify } from "@/lib/crypto"
import type { LootCase } from "@/lib/data"
import { cn } from "@/lib/utils"

export type FairEntry = {
  itemKey: string
  itemName: string
  nonce: number
}

function shortHex(h?: string) {
  if (!h) return ""
  return h.length > 24 ? `${h.slice(0, 12)}…${h.slice(-12)}` : h
}

export function FairSheet({ entries, box, proof, onClose }: {
  entries: FairEntry[]
  box: LootCase
  proof: FairProof
  onClose: () => void
}) {
  const { t } = useI18n()
  const [status, setStatus] = useState<"idle" | "checking" | "done">("idle")
  const [results, setResults] = useState<{ ok: boolean; hashOk: boolean; verifiable: boolean }[]>([])
  const [error, setError] = useState<string | null>(null)
  const items: CaseItemForVerify[] = (box.items ?? []).map((i) => ({ key: i.key, weight: i.weight, jackpot: Boolean(i.jackpot) }))

  useEffect(() => {
    setStatus("idle")
    setResults([])
    setError(null)
  }, [entries, box, proof])

  async function run() {
    if (status === "checking") return
    setStatus("checking")
    setError(null)
    try {
      const out: { ok: boolean; hashOk: boolean; verifiable: boolean }[] = []
      for (const e of entries) {
        const r = await verifyCaseProof({ ...proof, nonce: e.nonce }, items, e.itemKey)
        out.push({ ok: r.rollOk, hashOk: r.hashOk, verifiable: r.verifiable })
      }
      setResults(out)
    } catch {
      setError(t("fair.check_failed"))
      setResults([])
    } finally {
      setStatus("done")
    }
  }

  const revealed = Boolean(proof?.revealed_seed)
  const allOk = status === "done" && results.length > 0 && results.every((r) => r.verifiable && r.ok)

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border bg-card p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-lg font-bold">
            <ShieldCheck className="size-5 text-primary" />
            {t("fair.title")}
          </h3>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="rounded-xl bg-secondary p-2 active:scale-95">
            <X className="size-4" />
          </button>
        </div>

        {/* Сингл-проверка или список по дропам мульти-открытия */}
        <div className="space-y-2">
          {entries.map((e, i) => {
            const r = results[i]
            return (
              <div key={i} className="flex items-center gap-3 rounded-2xl border border-border bg-secondary/40 px-3 py-2.5">
                <span className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-xl",
                  r
                    ? r.verifiable
                      ? (r.ok ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400")
                      : "bg-secondary/60 text-muted-foreground"
                    : "bg-secondary text-muted-foreground",
                )}>
                  {!r ? (
                    <span className="text-xs font-bold">#{i + 1}</span>
                  ) : r.verifiable ? (
                    r.ok ? <ShieldCheck className="size-4" /> : <ShieldX className="size-4" />
                  ) : (
                    <Hourglass className="size-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{e.itemName}</p>
                  <p className="text-[10px] text-muted-foreground">{t("fair.nonce")}: {e.nonce}</p>
                </div>
                {r && r.verifiable && (
                  <span className="shrink-0 text-[10px] font-bold uppercase">
                    {r.ok ? t("fair.verify_ok") : t("fair.verify_fail")}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        <button
          type="button"
          onClick={run}
          disabled={status === "checking"}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground active:scale-[0.98] disabled:opacity-50"
        >
          {status === "checking" ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          {t("fair.verify")}
        </button>

        {status === "done" && !revealed && (
          <p className="mt-3 rounded-xl bg-secondary/60 px-3 py-2.5 text-center text-xs text-muted-foreground">{t("fair.not_ready", { n: proof?.rotate_every ?? 2000 })}</p>
        )}
        {error && (
          <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2.5 text-center text-xs font-semibold text-red-400">{error}</p>
        )}

        {status === "done" && revealed && allOk && (
          <p className="mt-3 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-center text-xs font-semibold text-emerald-400">{t("fair.verified_all")}</p>
        )}
        {status === "done" && revealed && !allOk && (
          <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2.5 text-center text-xs font-semibold text-red-400">{t("fair.failed_all")}</p>
        )}

        {/* Детали */}
        <div className="mt-4 space-y-2 rounded-2xl border border-border bg-secondary/30 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-muted-foreground">{t("fair.seed_version")}</span>
            <span className="font-mono text-[11px] font-bold">#{proof?.seed_version}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-muted-foreground">{t("fair.commitment")}</span>
            <span className="max-w-[60%] truncate font-mono text-[11px]" title={proof?.seed_hash}>{shortHex(proof?.seed_hash)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-muted-foreground">{t("fair.client_seed")}</span>
            <span className="max-w-[60%] truncate font-mono text-[11px]" title={proof?.client_seed}>{shortHex(proof?.client_seed)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-muted-foreground">{t("fair.server_seed")}</span>
            <span className={cn("max-w-[60%] truncate font-mono text-[11px]", revealed ? "text-emerald-400" : "text-muted-foreground")} title={proof?.revealed_seed}>
              {revealed ? shortHex(proof!.revealed_seed!) : t("fair.seed_hidden")}
            </span>
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("fair.how")}</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">{t("fair.how_text", { n: proof?.rotate_every ?? 2000 })}</p>
        </div>
      </div>
    </div>
  )
}
