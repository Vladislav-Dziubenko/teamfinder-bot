"use client"

import { Crown, Shield, ShieldCheck, FlaskConical } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const ROLE_META: Record<
  string,
  { labelKey: string; icon: typeof Crown; className: string }
> = {
  developer: {
    labelKey: "role.developer",
    icon: Crown,
    className: "border-amber-400/60 bg-gradient-to-r from-amber-400/20 to-yellow-300/20 text-amber-300",
  },
  admin: {
    labelKey: "role.admin",
    icon: Shield,
    className: "border-red-500/50 bg-red-500/15 text-red-400",
  },
  moderator: {
    labelKey: "role.moderator",
    icon: ShieldCheck,
    className: "border-sky-500/50 bg-sky-500/15 text-sky-400",
  },
  beta_tester: {
    labelKey: "role.beta_tester",
    icon: FlaskConical,
    className: "border-emerald-500/50 bg-emerald-500/15 text-emerald-400",
  },
}

export function RoleBadge({ role, className }: { role?: string; className?: string }) {
  const { t } = useI18n()
  const meta = role ? ROLE_META[role] : null
  if (!meta) return null
  const Icon = meta.icon
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold leading-none",
        meta.className,
        className,
      )}
    >
      <Icon className="size-3" />
      {t(meta.labelKey)}
    </span>
  )
}

export function roleRank(role?: string): number {
  if (role === "developer") return 3
  if (role === "admin") return 2
  if (role === "moderator") return 1
  return 0
}
