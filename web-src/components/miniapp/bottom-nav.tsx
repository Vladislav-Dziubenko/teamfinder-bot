"use client"

import { Home, Swords, Package, Trophy, Ticket, User, BarChart3, MessageCircle, TrendingUp } from "lucide-react"
import { useTotalUnread } from "@/lib/chat"
import { cn } from "@/lib/utils"

export type TabId =
  | "home"
  | "match"
  | "predictions"
  | "chat"
  | "stats"
  | "cases"
  | "battlepass"
  | "promo"
  | "guides"
  | "donate"
  | "profile"

const items: { id: TabId; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Главная", icon: Home },
  { id: "match", label: "Тиммейты", icon: Swords },
  { id: "predictions", label: "Прогнозы", icon: TrendingUp },
  { id: "chat", label: "Чат", icon: MessageCircle },
  { id: "stats", label: "Статы", icon: BarChart3 },
  { id: "cases", label: "Кейсы", icon: Package },
  { id: "battlepass", label: "Пасс", icon: Trophy },
  { id: "promo", label: "Промо", icon: Ticket },
  { id: "profile", label: "Профиль", icon: User },
]

export function BottomNav({
  active,
  onChange,
}: {
  active: TabId
  onChange: (t: TabId) => void
}) {
  const unread = useTotalUnread()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md">
      <div className="border-t border-border bg-card/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <ul className="no-scrollbar flex items-stretch overflow-x-auto px-1">
          {items.map(({ id, label, icon: Icon }) => {
            const isActive = active === id
            const showBadge = id === "chat" && unread > 0
            return (
              <li key={id} className="min-w-[3.9rem] flex-1">
                <button
                  type="button"
                  onClick={() => onChange(id)}
                  className="group relative flex w-full flex-col items-center gap-1 py-2.5"
                  aria-current={isActive ? "page" : undefined}
                >
                  {isActive && (
                    <span className="absolute -top-px h-0.5 w-8 rounded-full bg-primary shadow-[0_0_12px_var(--primary)]" />
                  )}
                  <span className="relative">
                    <Icon
                      className={cn(
                        "size-5 transition-all duration-200",
                        isActive
                          ? "scale-110 text-primary drop-shadow-[0_0_6px_var(--primary)]"
                          : "text-muted-foreground group-active:scale-90",
                      )}
                    />
                    {showBadge && (
                      <span className="absolute -right-2 -top-1.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold leading-4 text-primary-foreground">
                        {unread}
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-medium tracking-wide transition-colors",
                      isActive ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {label}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </nav>
  )
}
