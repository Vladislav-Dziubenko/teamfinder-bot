"use client"

import { Home, Swords, MessageCircle, Package, User, LayoutGrid, Trophy, BarChart3, TrendingUp, Ticket, Users, Gem, Star, BookOpen, Store } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { useTotalUnread } from "@/lib/chat"
import { hapticTap } from "@/lib/webapp"
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
  | "friends"
  | "model"
  | "review"
  | "market"

// Основные вкладки — всегда видны на панели. Остальные — в меню «Ещё».
export const MAIN_TABS: { id: TabId; labelKey: string; icon: typeof Home }[] = [
  { id: "home", labelKey: "nav.home", icon: Home },
  { id: "match", labelKey: "nav.match", icon: Swords },
  { id: "chat", labelKey: "nav.chat", icon: MessageCircle },
  { id: "cases", labelKey: "nav.cases", icon: Package },
  { id: "profile", labelKey: "nav.profile", icon: User },
]

// Вкладки в меню «Ещё»: порядок = порядок отображения в сетке.
export const MORE_TABS: { id: TabId; labelKey: string; descKey: string; icon: typeof Home }[] = [
  { id: "predictions", labelKey: "nav.predictions", descKey: "more.desc_predictions", icon: TrendingUp },
  { id: "stats", labelKey: "nav.stats", descKey: "more.desc_stats", icon: BarChart3 },
  { id: "battlepass", labelKey: "nav.battlepass", descKey: "more.desc_battlepass", icon: Trophy },
  { id: "promo", labelKey: "nav.promo", descKey: "more.desc_promo", icon: Ticket },
  { id: "guides", labelKey: "nav.guides", descKey: "more.desc_guides", icon: BookOpen },
  { id: "friends", labelKey: "nav.friends", descKey: "more.desc_friends", icon: Users },
  { id: "model", labelKey: "nav.model", descKey: "more.desc_model", icon: Gem },
  { id: "review", labelKey: "nav.review", descKey: "more.desc_review", icon: Star },
  { id: "market", labelKey: "nav.market", descKey: "more.desc_market", icon: Store },
]

export function BottomNav({
  active,
  onChange,
  onMore,
}: {
  active: TabId
  onChange: (t: TabId) => void
  onMore: () => void
}) {
  const { t } = useI18n()
  const unread = useTotalUnread()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md">
      <div className="border-t border-border bg-card/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <ul className="flex items-stretch gap-0.5 px-1">
          {MAIN_TABS.map(({ id, labelKey, icon: Icon }) => {
            const isActive = active === id
            const showBadge = id === "chat" && unread > 0
            return (
              <li key={id} className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => {
                    if (!isActive) hapticTap()
                    onChange(id)
                  }}
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
                      "max-w-full truncate text-[10px] font-medium tracking-wide transition-colors",
                      isActive ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {t(labelKey)}
                  </span>
                </button>
              </li>
            )
          })}

          {/* Кнопка «Ещё» — открывает панель с остальными вкладками */}
          <li className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => {
                hapticTap()
                onMore()
              }}
              className="group relative flex w-full flex-col items-center gap-1 py-2.5"
              aria-label={t("more.title")}
            >
              <span className="relative">
                <LayoutGrid
                  className={cn(
                    "size-5 transition-all duration-200 group-active:scale-90",
                    "text-muted-foreground",
                  )}
                />
              </span>
              <span className="max-w-full truncate text-[10px] font-medium tracking-wide text-muted-foreground">
                {t("more.title")}
              </span>
            </button>
          </li>
        </ul>
      </div>
    </nav>
  )
}
