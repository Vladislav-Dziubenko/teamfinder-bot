"use client"

import { Home, Swords, Package, BookOpen, Star, User } from "lucide-react"
import { cn } from "@/lib/utils"

export type TabId = "home" | "match" | "cases" | "guides" | "donate" | "profile"

const items: { id: TabId; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Главная", icon: Home },
  { id: "match", label: "Тиммейты", icon: Swords },
  { id: "cases", label: "Кейсы", icon: Package },
  { id: "guides", label: "Гайды", icon: BookOpen },
  { id: "donate", label: "Звёзды", icon: Star },
  { id: "profile", label: "Профиль", icon: User },
]

export function BottomNav({
  active,
  onChange,
}: {
  active: TabId
  onChange: (t: TabId) => void
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md">
      <div className="border-t border-border bg-card/85 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <ul className="flex items-stretch justify-between">
          {items.map(({ id, label, icon: Icon }) => {
            const isActive = active === id
            return (
              <li key={id} className="flex-1">
                <button
                  type="button"
                  onClick={() => onChange(id)}
                  className="group relative flex w-full flex-col items-center gap-1 py-2.5"
                  aria-current={isActive ? "page" : undefined}
                >
                  {isActive && (
                    <span className="absolute -top-px h-0.5 w-8 rounded-full bg-primary shadow-[0_0_12px_var(--primary)]" />
                  )}
                  <Icon
                    className={cn(
                      "size-5 transition-all duration-200",
                      isActive
                        ? "scale-110 text-primary drop-shadow-[0_0_6px_var(--primary)]"
                        : "text-muted-foreground group-active:scale-90",
                    )}
                  />
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
