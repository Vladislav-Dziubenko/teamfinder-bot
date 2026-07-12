"use client"

import { useEffect, useState } from "react"
import { Swords, Radio, ChevronRight, BookOpen } from "lucide-react"
import { api, type GamesResponse, type MeResponse, type MatchResult, type GuideItem } from "@/lib/api"
import type { TabId } from "./bottom-nav"
import { gameColor } from "@/lib/data"

export function HomeTab({
  games,
  me,
  onGo,
  onConnect,
}: {
  games: GamesResponse
  me: MeResponse | null
  onGo: (t: TabId) => void
  onConnect: (p: MatchResult) => void
}) {
  const [matches, setMatches] = useState<MatchResult[] | null>(null)
  const [featuredGuide, setFeaturedGuide] = useState<GuideItem | null>(null)
  const profile = me?.profile ?? null

  useEffect(() => {
    if (profile) {
      api
        .search()
        .then((r) => setMatches(r.results.slice(0, 6)))
        .catch(() => setMatches([]))
    }
    api
      .guides(profile?.game)
      .then((r) => setFeaturedGuide(r.guides[0] ?? null))
      .catch(() => setFeaturedGuide(null))
  }, [profile?.game])

  const gameInfo = profile ? games.games[profile.game] : null

  return (
    <div className="space-y-6 px-4 py-5">
      {/* Hero */}
      <section className="animate-rise relative overflow-hidden rounded-3xl border border-border">
        <img src="/hero-arena.png" alt="" className="h-52 w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/10" />
        <div className="absolute inset-x-0 bottom-0 p-5">
          <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent">
            <Radio className="size-3" /> CS2 · Roblox · WoT · War Thunder и другие
          </span>
          <h1 className="font-display text-3xl font-bold leading-none text-balance text-glow-primary">
            Найди свою команду мечты
          </h1>
          <p className="mt-1.5 max-w-[16rem] text-sm text-muted-foreground text-pretty">
            Подбор тиммейтов по игре, рангу и вайбу — без токсиков и рандомов.
          </p>
          <button
            type="button"
            onClick={() => onGo("match")}
            className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)] transition-transform active:scale-95"
          >
            <Swords className="size-4" /> {profile ? "Найти тиммейтов" : "Начать — заполнить анкету"}
          </button>
        </div>
      </section>

      {/* Профиль-статус вместо выдуманных "побед/уровня" */}
      {profile && gameInfo ? (
        <section className="rounded-3xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Твоя анкета</p>
          <p className="mt-1 font-display text-lg font-bold">
            {gameInfo.emoji} {profile.nickname} · {gameInfo.title}
          </p>
          <p className="text-sm text-muted-foreground">
            {profile.rank} · {profile.role}
          </p>
        </section>
      ) : (
        <section className="rounded-3xl border border-dashed border-primary/40 bg-primary/5 p-4">
          <p className="font-display text-base font-bold">Анкета ещё не заполнена</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Заполни её, чтобы тебя нашли и чтобы видеть тиммейтов по своей игре.
          </p>
          <button
            type="button"
            onClick={() => onGo("profile")}
            className="mt-3 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Заполнить анкету
          </button>
        </section>
      )}

      {/* Тиммейты по твоей игре */}
      {profile && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Подходят тебе</h2>
            <button
              type="button"
              onClick={() => onGo("match")}
              className="flex items-center gap-0.5 text-xs font-medium text-primary"
            >
              все <ChevronRight className="size-3.5" />
            </button>
          </div>
          {matches === null ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">Пока никого не нашли по твоей игре — загляни позже.</p>
          ) : (
            <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
              {matches.map((p, i) => (
                <button
                  key={p.user_id}
                  type="button"
                  onClick={() => onConnect(p)}
                  className="animate-rise w-36 shrink-0 overflow-hidden rounded-2xl border border-border bg-card text-left"
                  style={{ animationDelay: `${i * 70}ms` }}
                >
                  <div className="relative flex h-20 items-center justify-center bg-secondary">
                    <span className="font-display text-2xl font-bold text-muted-foreground">
                      {p.nickname.charAt(0).toUpperCase()}
                    </span>
                    <span className="absolute right-2 top-2 rounded bg-primary/90 px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                      {p.score}%
                    </span>
                  </div>
                  <div className="p-2.5">
                    <p className="truncate font-display text-sm font-bold">{p.nickname}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{p.rank}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Гайд дня — реальный, из бэкенда */}
      {featuredGuide && (
        <button
          type="button"
          onClick={() => onGo("guides")}
          className="animate-scan relative flex w-full items-center gap-3 overflow-hidden rounded-3xl border border-primary/30 bg-primary/5 p-5 text-left"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
            <BookOpen className="size-5" />
          </span>
          <div className="min-w-0">
            <span className="text-xs font-medium uppercase tracking-widest text-primary">Гайд</span>
            <p className="mt-0.5 truncate font-display text-base font-bold text-balance">{featuredGuide.title}</p>
            <p className="text-xs text-muted-foreground">
              {featuredGuide.unlocked ? "Открыт" : `${featuredGuide.stars}⭐ за полную версию`}
            </p>
          </div>
        </button>
      )}
    </div>
  )
}
