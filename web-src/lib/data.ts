export type Game = {
  id: string
  name: string
  short: string
  color: string
}

export const games: Game[] = [
  { id: "cs2", name: "Counter-Strike 2", short: "CS2", color: "var(--primary)" },
  { id: "dota", name: "Dota 2", short: "Dota", color: "var(--accent)" },
  { id: "valorant", name: "Valorant", short: "VAL", color: "var(--destructive)" },
  { id: "pubg", name: "PUBG", short: "PUBG", color: "var(--stars)" },
  { id: "apex", name: "Apex Legends", short: "APEX", color: "var(--chart-5)" },
]

export type Player = {
  id: string
  nick: string
  realName: string
  avatar: string
  game: string
  rank: string
  role: string
  kd: number
  winrate: number
  hours: number
  online: boolean
  tags: string[]
  bio: string
  tgUsername: string
  vibe: number // % совместимости
  level?: number
  lastSeen?: string // «5 мин назад» и т.п.
  // «необычные» анкеты — задонатили или очень опытные. Открываются за звёзды.
  locked?: boolean
  unlockStars?: number
  reason?: "donor" | "veteran" // почему закрыт
}

export const players: Player[] = []

export type Team = {
  id: string
  name: string
  tag: string
  game: string
  needRole: string
  minRank: string
  members: number
  maxMembers: number
  region: string
  vibe: string[]
}

export const teams: Team[] = []

export type Guide = {
  id: string
  title: string
  game: string
  cover: string
  author: string
  duration: string
  views: string
  type: "Видео" | "Лайнапы" | "Разбор"
  level: "Новичок" | "Продвинутый" | "Про"
}

export const guides: Guide[] = []

export type StarPack = {
  id: string
  stars: number
  bonus?: string
  perk: string
  popular?: boolean
}

export const starPacks: StarPack[] = [
  { id: "p1", stars: 38, perk: "Буст профиля на 24 часа" },
  { id: "p2", stars: 125, perk: "Значок PRO + приоритет в поиске", bonus: "+15%", popular: true },
  { id: "p3", stars: 250, perk: "PRO на месяц + кастомный ник", bonus: "+25%" },
  { id: "p4", stars: 500, perk: "Всё сразу + анимированная рамка", bonus: "+40%" },
]

export const currentUser = {
  nick: "you_gg",
  realName: "Ты",
  rank: "—",
  game: "cs2",
  stars: 0,
  coins: 0,
  points: 0,
  level: 0,
  xp: 0,
  wins: 0,
  friends: 0,
}

/* ---------- Nexus-валюта, кейсы, инвентарь ---------- */

export type Rarity = "common" | "rare" | "epic" | "premium"

export const rarityMeta: Record<Rarity, { label: string; color: string }> = {
  common: { label: "Обычный", color: "var(--muted-foreground)" },
  rare: { label: "Редкий", color: "var(--accent)" },
  epic: { label: "Эпический", color: "var(--stars)" },
  premium: { label: "Премиум", color: "var(--primary)" },
}

export type CaseItem = {
  key: string
  name: string
  desc: string
  image?: string // картинка предмета
  icon?: string // emoji-иконка для мелких предметов игроков
  rarity: Rarity
  sell: number // цена продажи в монетках Nexus
  weight: number // шанс выпадения
  grantsPremium?: boolean // выдаёт премиум-статус
}

export type LootCase = {
  id: string
  name: string
  subtitle: string
  image: string
  gold: boolean
  costStars: number // 0 = бесплатный
  free: boolean
  dailyLimit: number // сколько открытий в день
  items: CaseItem[]
}

// 6 иконок для игроков — по отдельности выбиваются из синего кейса, каждая по 20 монет
export const playerIcons: CaseItem[] = [
  { key: "icon-skull", name: "Череп", desc: "Иконка «Череп»", icon: "💀", rarity: "common", sell: 20, weight: 10 },
  { key: "icon-fire", name: "Пламя", desc: "Иконка «Пламя»", icon: "🔥", rarity: "common", sell: 20, weight: 10 },
  { key: "icon-crown", name: "Корона", desc: "Иконка «Корона»", icon: "👑", rarity: "common", sell: 20, weight: 10 },
  { key: "icon-target", name: "Прицел", desc: "Иконка «Прицел»", icon: "🎯", rarity: "common", sell: 20, weight: 10 },
  { key: "icon-bolt", name: "Молния", desc: "Иконка «Молния»", icon: "⚡", rarity: "common", sell: 20, weight: 10 },
  { key: "icon-star", name: "Звезда", desc: "Иконка «Звезда»", icon: "⭐", rarity: "common", sell: 20, weight: 10 },
]

export const lootCases: LootCase[] = [
  {
    id: "blue",
    name: "Nexus Counter Strike 1.6",
    subtitle: "Бесплатный ежедневный кейс",
    image: "/case-blue.png",
    gold: false,
    costStars: 0,
    free: true,
    dailyLimit: 1, // 1 бесплатное открытие в день, дальше кулдаун 24ч
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
    costStars: 75,
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
]

// Магазин: продажа карточек за монетки
export const coinShop: { key: string; name: string; desc: string; image: string; price: number }[] = [
  { key: "buy-premium-card", name: "Премиум-анкета", desc: "Кастом фото, текст и украшения на 1 день", image: "/premium-reveal.png", price: 100 },
  { key: "buy-premium-lite", name: "Премиум", desc: "Премиум-статус для анкеты", image: "/premium-card.png", price: 45 },
  { key: "buy-ak47", name: "Скин AK-47", desc: "Легендарный калаш", image: "/ak47.png", price: 18 },
  { key: "buy-premium-medium", name: "Премиум средний", desc: "4 открытия в день", image: "/premium-x4.png", price: 38 },
]

/* ---------- Достижения ---------- */

export type Achievement = {
  id: string
  game: string
  title: string
  desc: string
  minutes: number
  progress: number // текущие минуты
  points: number
  coins: number
  withTeammate: boolean
}

export const achievements: Achievement[] = []

/* ---------- Лидерборд донатеров ---------- */

export type LeaderEntry = {
  id: string
  nick: string
  avatar: string
  stars: number // всего задонатил Telegram Stars
  coins: number // куплено Nexus-валюты
  premium: boolean
}

/* ---------- Батл-пасс ---------- */

export type BattlePassReward = {
  key: string
  name: string
  icon?: string
  image?: string
  type: "coins" | "stars" | "item" | "premium" | "decoration"
  amount?: number
  rarity?: Rarity
}

export type BattlePassTier = {
  level: number
  xp: number // сколько XP нужно набрать суммарно к этому уровню
  free: BattlePassReward | null
  premium: BattlePassReward
}

// Сезонный батл-пасс: премиум-трек выдаёт вещи из премиум-контейнера
export const battlePassPriceStars = 125
export const battlePassXpPerLevel = 100

export const battlePassTiers: BattlePassTier[] = [
  {
    level: 1,
    xp: 100,
    free: { key: "bp1f", name: "50 монет", type: "coins", amount: 50, icon: "🪙" },
    premium: { key: "bp1p", name: "Скин AK-47", type: "item", image: "/ak47.png", rarity: "rare" },
  },
  {
    level: 2,
    xp: 200,
    free: { key: "bp2f", name: "Иконка «Пламя»", type: "item", icon: "🔥", rarity: "common" },
    premium: { key: "bp2p", name: "120 монет", type: "coins", amount: 120, icon: "🪙" },
  },
  {
    level: 3,
    xp: 300,
    free: null,
    premium: { key: "bp3p", name: "Премиум средний", type: "item", image: "/premium-x4.png", rarity: "epic" },
  },
  {
    level: 4,
    xp: 400,
    free: { key: "bp4f", name: "25 звёзд", type: "stars", amount: 25, icon: "⭐" },
    premium: { key: "bp4p", name: "Украшение «Cyber»", type: "decoration", amount: 0, icon: "✨" },
  },
  {
    level: 5,
    xp: 500,
    free: { key: "bp5f", name: "Иконка «Корона»", type: "item", icon: "👑", rarity: "common" },
    premium: { key: "bp5p", name: "Премиум", type: "item", image: "/premium-card.png", rarity: "epic" },
  },
  {
    level: 6,
    xp: 600,
    free: null,
    premium: { key: "bp6p", name: "200 монет", type: "coins", amount: 200, icon: "🪙" },
  },
  {
    level: 7,
    xp: 700,
    free: { key: "bp7f", name: "35 монет", type: "coins", amount: 35, icon: "🪙" },
    premium: { key: "bp7p", name: "Украшение «Blood»", type: "decoration", amount: 0, icon: "✨" },
  },
  {
    level: 8,
    xp: 800,
    free: { key: "bp8f", name: "Иконка «Молния»", type: "item", icon: "⚡", rarity: "common" },
    premium: { key: "bp8p", name: "50 звёзд", type: "stars", amount: 50, icon: "⭐" },
  },
  {
    level: 9,
    xp: 900,
    free: null,
    premium: { key: "bp9p", name: "Премиум средний", type: "item", image: "/premium-x4.png", rarity: "epic" },
  },
  {
    level: 10,
    xp: 1000,
    free: { key: "bp10f", name: "100 монет", type: "coins", amount: 100, icon: "🪙" },
    premium: { key: "bp10p", name: "Премиум-анкета", type: "item", image: "/premium-reveal.png", rarity: "premium" },
  },
]

/* ---------- Реферальная программа ---------- */

export const referralReward = { coins: 50, stars: 5 } // за каждого приглашённого
export const referralBotUrl = "https://t.me/NexusTeammatesBot"

/* ---------- Промокоды (стартовые) ---------- */

export type PromoReward = { coins: number; stars: number; xp?: number }
export type PromoCode = {
  code: string
  reward: PromoReward
  maxUses: number
  uses: number
  createdByUser?: boolean
}

export const defaultPromoCodes: PromoCode[] = [
  { code: "NEXUS2026", reward: { coins: 100, stars: 10 }, maxUses: 1000, uses: 342 },
  { code: "WELCOME", reward: { coins: 50, stars: 0 }, maxUses: 5000, uses: 1280 },
  { code: "GGWP", reward: { coins: 30, stars: 5, xp: 50 }, maxUses: 500, uses: 118 },
]

/* ---------- Ежедневный стрик ---------- */

export const dailyStreakRewards = [
  { day: 1, coins: 10 },
  { day: 2, coins: 20 },
  { day: 3, coins: 35 },
  { day: 4, coins: 50 },
  { day: 5, coins: 75 },
  { day: 6, coins: 100 },
  { day: 7, coins: 200 },
]

export const leaderboard: LeaderEntry[] = []
