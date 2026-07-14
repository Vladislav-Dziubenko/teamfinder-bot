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
};

export function gameColor(gameId: string): string {
  return GAME_COLORS[gameId] ?? "var(--primary)";
}

/* ---------- Nexus-валюта, кейсы, инвентарь ---------- */

export type Rarity = "common" | "rare" | "epic" | "premium";

export const rarityMeta: Record<Rarity, { label: string; color: string }> = {
  common: { label: "Обычный", color: "var(--muted-foreground)" },
  rare: { label: "Редкий", color: "var(--accent)" },
  epic: { label: "Эпический", color: "var(--stars)" },
  premium: { label: "Премиум", color: "var(--primary)" },
};

export type CaseItem = {
  key: string;
  name: string;
  desc: string;
  image?: string; // картинка предмета
  icon?: string; // emoji-иконка для мелких предметов игроков
  rarity: Rarity;
  sell: number; // цена продажи в монетках Nexus
  weight: number; // шанс выпадения
  grantsPremium?: boolean; // выдаёт премиум-статус
};

export type LootCase = {
  id: string;
  name: string;
  subtitle: string;
  image: string;
  gold: boolean;
  costStars: number; // 0 = бесплатный
  free: boolean;
  dailyLimit: number; // сколько открытий в день
  items: CaseItem[];
};

// 6 иконок для игроков — по отдельности выбиваются из синего кейса, каждая по 20 монет
export const playerIcons: CaseItem[] = [
  { key: "icon-skull", name: "Череп", desc: "Иконка «Череп»", icon: "💀", rarity: "common", sell: 20, weight: 10 },
  { key: "icon-fire", name: "Пламя", desc: "Иконка «Пламя»", icon: "🔥", rarity: "common", sell: 20, weight: 10 },
  { key: "icon-crown", name: "Корона", desc: "Иконка «Корона»", icon: "👑", rarity: "common", sell: 20, weight: 10 },
  { key: "icon-target", name: "Прицел", desc: "Иконка «Прицел»", icon: "🎯", rarity: "common", sell: 20, weight: 10 },
  { key: "icon-bolt", name: "Молния", desc: "Иконка «Молния»", icon: "⚡", rarity: "common", sell: 20, weight: 10 },
  { key: "icon-star", name: "Звезда", desc: "Иконка «Звезда»", icon: "⭐", rarity: "common", sell: 20, weight: 10 },
];

export const lootCases: LootCase[] = [
  {
    id: "blue",
    name: "Nexus Counter Strike 1.6",
    subtitle: "Бесплатный ежедневный кейс",
    image: "/case-blue.png",
    gold: false,
    costStars: 0,
    free: true,
    dailyLimit: 1, // 1 открытие в день
    items: [
      {
        key: "premium-medium",
        name: "Премиум средний",
        desc: "Премиум-доступ на 4 открытия в день",
        image: "/premium-x4.png",
        rarity: "epic",
        sell: 75,
        weight: 8,
        grantsPremium: true,
      },
      {
        key: "ak47",
        name: "Скин AK-47",
        desc: "Легендарный калаш из старой школы",
        image: "/ak47.png",
        rarity: "rare",
        sell: 35,
        weight: 14,
      },
      ...playerIcons,
    ],
  },
  {
    id: "gold",
    name: "Nexus Premium",
    subtitle: "Золотой премиальный кейс",
    image: "/case-gold.png",
    gold: true,
    costStars: 150,
    free: false,
    dailyLimit: 99,
    items: [
      {
        key: "premium-card",
        name: "Премиум-анкета",
        desc: "Кастомные фото, свой текст и украшения карточки — без ограничений 1 день",
        image: "/premium-reveal.png",
        rarity: "premium",
        sell: 200,
        weight: 60,
        grantsPremium: true,
      },
      {
        key: "premium-card-lite",
        name: "Премиум",
        desc: "Премиум-статус для анкеты",
        image: "/premium-card.png",
        rarity: "epic",
        sell: 90,
        weight: 40,
        grantsPremium: true,
      },
    ],
  },
];

// Магазин: продажа карточек за монетки
export const coinShop: { key: string; name: string; desc: string; image: string; price: number }[] = [
  { key: "buy-premium-card", name: "Премиум-анкета", desc: "Кастом фото, текст и украшения на 1 день", image: "/premium-reveal.png", price: 200 },
  { key: "buy-premium-lite", name: "Премиум", desc: "Премиум-статус для анкеты", image: "/premium-card.png", price: 90 },
  { key: "buy-ak47", name: "Скин AK-47", desc: "Легендарный калаш", image: "/ak47.png", price: 35 },
  { key: "buy-premium-medium", name: "Премиум средний", desc: "4 открытия в день", image: "/premium-x4.png", price: 75 },
];
