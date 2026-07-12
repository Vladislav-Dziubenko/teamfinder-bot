// Тут больше нет замоканных игроков/команд/паков — все реальные данные идут
// через lib/api.ts с бэкенда бота. Здесь только чисто визуальные константы:
// у каждой реальной игры (см. data/games.py на бэкенде) — свой акцентный цвет
// для карточек и чипов.

export const GAME_COLORS: Record<string, string> = {
  cs2: "var(--primary)",
  roblox: "var(--chart-5)",
  wot: "var(--stars)",
  wt: "var(--accent)",
  dota2: "var(--destructive)",
  valorant: "var(--destructive)",
  minecraft: "var(--chart-5)",
  fortnite: "var(--accent)",
  apex: "var(--stars)",
  rust: "var(--primary)",
}

export function gameColor(gameId: string): string {
  return GAME_COLORS[gameId] ?? "var(--primary)"
}
