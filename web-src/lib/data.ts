export type Game = {
  id: string
  name: string
  short: string
  color: string
  emoji: string
}

export const games: Game[] = [
  { id: "cs2", name: "Counter-Strike 2", short: "CS2", color: "var(--primary)", emoji: "🔫" },
  { id: "roblox", name: "Roblox", short: "RBX", color: "var(--chart-1)", emoji: "🧱" },
  { id: "wot", name: "World of Tanks", short: "WoT", color: "var(--destructive)", emoji: "🪖" },
  { id: "wt", name: "War Thunder", short: "WT", color: "var(--chart-4)", emoji: "✈️" },
  { id: "dota2", name: "Dota 2", short: "Dota", color: "var(--accent)", emoji: "🏰" },
  { id: "valorant", name: "Valorant", short: "VAL", color: "var(--chart-5)", emoji: "🔮" },
  { id: "minecraft", name: "Minecraft", short: "MC", color: "var(--stars)", emoji: "⛏️" },
  { id: "fortnite", name: "Fortnite", short: "FN", color: "var(--chart-3)", emoji: "🛡️" },
  { id: "apex", name: "Apex Legends", short: "APEX", color: "var(--chart-2)", emoji: "⚡" },
  { id: "rust", name: "Rust", short: "Rust", color: "var(--chart-6)", emoji: "🦀" },
]

// Слаги ролей для локализации: game -> [русская строка, slug]. Фронт получает
// роль строкой (как в БД), ищет её в списке и подставляет перевод через
// i18n-ключ role.<game>.<slug> (см. web-src/locales).
const GAME_ROLE_SLUGS: Record<string, [string, string][]> = {
  cs2: [["AWPer", "awper"], ["Entry", "entry"], ["Support", "support"], ["IGL", "igl"], ["Lurker", "lurker"], ["Универсал", "universal"]],
  roblox: [["Лидер", "leader"], ["Билдер", "builder"], ["Скриптер", "scripter"], ["Дизайнер", "designer"], ["PvP", "pvp"], ["Ролевик", "roleplayer"]],
  wot: [["Тяжёлый", "heavy"], ["Средний", "medium"], ["ЛТ", "light"], ["ПТ-САУ", "td"], ["САУ", "spg"], ["Универсал", "universal"]],
  wt: [["Истребитель", "fighter"], ["Штурмовик", "attacker"], ["Бомбардировщик", "bomber"], ["Танки", "tanks"], ["Вертолёты", "helicopters"], ["Смешанный", "mixed"]],
  dota2: [["Керри", "carry"], ["Мид", "mid"], ["Оффлейн", "offlane"], ["Саппорт 4", "support4"], ["Саппорт 5", "support5"], ["Капитан", "captain"]],
  valorant: [["Дуэлянт", "duelist"], ["Инициатор", "initiator"], ["Контроллер", "controller"], ["Сентинел", "sentinel"], ["IGL", "igl"]],
  minecraft: [["Билдер", "builder"], ["Редстоун", "redstone"], ["PvP", "pvp"], ["Фарм", "farm"], ["Ивенты", "events"], ["Выживание", "survival"]],
  fortnite: [["Шотганер", "shotgunner"], ["Билдер", "builder"], ["IGL", "igl"], ["Саппорт", "support"], ["Снайпер", "sniper"]],
  apex: [["Entry", "entry"], ["Support", "support"], ["Flex", "flex"], ["IGL", "igl"]],
  rust: [["Рейдер", "raider"], ["Фармер", "farmer"], ["Билдер", "builder"], ["Электрик", "electrician"], ["PvP", "pvp"]],
}

const GAME_RANK_SLUGS: Record<string, [string, string][]> = {
  cs2: [["Silver", "silver"], ["Gold Nova", "goldnova"], ["MG", "mg"], ["DMG", "dmg"], ["LE", "le"], ["LEM", "lem"], ["Supreme", "supreme"], ["Global Elite", "global"], ["Faceit 1-3", "faceit1"], ["Faceit 4-7", "faceit2"], ["Faceit 8-10", "faceit3"]],
  roblox: [["Новичок", "newbie"], ["Средний", "mid"], ["Опытный", "exp"], ["Про", "pro"]],
  wot: [["Новичок", "newbie"], ["Бронза", "bronze"], ["Серебро", "silver"], ["Золото", "gold"], ["Платина", "platinum"], ["Алмаз", "diamond"], ["Мастер", "master"]],
  wt: [["Новичок", "newbie"], ["Ранк 3-4", "rank3"], ["Ранк 5-6", "rank5"], ["Ранк 7-8", "rank7"], ["Топ-ранк", "top"]],
  dota2: [["Herald", "herald"], ["Guardian", "guardian"], ["Crusader", "crusader"], ["Archon", "archon"], ["Legend", "legend"], ["Ancient", "ancient"], ["Divine", "divine"], ["Immortal", "immortal"]],
  valorant: [["Iron", "iron"], ["Bronze", "bronze"], ["Silver", "silver"], ["Gold", "gold"], ["Platinum", "platinum"], ["Diamond", "diamond"], ["Ascendant", "ascendant"], ["Immortal", "immortal"], ["Radiant", "radiant"]],
  minecraft: [["Казуал", "casual"], ["Опытный", "exp"], ["Хардкор", "hardcore"]],
  fortnite: [["0-1000", "r1"], ["1000-3000", "r2"], ["3000-5000", "r3"], ["5000-8000", "r4"], ["8000+", "r5"]],
  apex: [["Bronze", "bronze"], ["Silver", "silver"], ["Gold", "gold"], ["Platinum", "platinum"], ["Diamond", "diamond"], ["Master", "master"], ["Predator", "predator"]],
  rust: [["Новичок", "newbie"], ["100ч+", "h100"], ["500ч+", "h500"], ["1000ч+", "h1000"]],
}

/** i18n-ключ для роли игрока: role.<game>.<slug>, пустая строка если не найдена. */
export function roleL10nKey(gameId: string, role: string): string {
  const list = GAME_ROLE_SLUGS[gameId]
  if (!list || !role) return ""
  const found = list.find(([ru]) => ru.toLowerCase() === role.toLowerCase())
  return found ? `role.${gameId}.${found[1]}` : ""
}

/** i18n-ключ для ранга игрока: rank.<game>.<slug>, пустая строка если не найден. */
export function rankL10nKey(gameId: string, rank: string): string {
  const list = GAME_RANK_SLUGS[gameId]
  if (!list || !rank) return ""
  const found = list.find(([ru]) => ru.toLowerCase() === rank.toLowerCase())
  return found ? `rank.${gameId}.${found[1]}` : ""
}

export type Player = {
  id: string
  user_id?: number
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
  vibe: number
  level?: number
  lastSeen?: string
  searching_minutes?: number
  locked?: boolean
  unlockStars?: number
  reason?: "donor" | "veteran"
  fav_games?: string
  has_discord?: boolean
  skin?: string
  rating_avg?: number
  rating_count?: number
}

export const players: Player[] = [
  {
    id: "1",
    nick: "s1mple_wannabe",
    realName: "Артём",
    avatar: "/player-1.webp",
    game: "cs2",
    rank: "Global Elite",
    role: "AWPer",
    kd: 1.34,
    winrate: 62,
    hours: 3200,
    online: true,
    tags: ["Микрофон", "Тащу клатчи", "Без токсика"],
    bio: "Ищу пятого в пати на фейсит, играю только на серьёзе. Дискорд обязателен.",
    tgUsername: "artem_awp",
    vibe: 94,
    level: 42,
    lastSeen: "в сети",
  },
  {
    id: "2",
    nick: "cyberKitty",
    realName: "Лена",
    avatar: "/player-2.webp",
    game: "valorant",
    rank: "Immortal 2",
    role: "Дуэлянт",
    kd: 1.21,
    winrate: 58,
    hours: 1800,
    online: true,
    tags: ["Игрок с каллами", "Позитив", "Стример"],
    bio: "Раш B и погнали. Люблю агрессивный стиль, ищу стак на ранкед.",
    tgUsername: "cyber_lena",
    vibe: 88,
    level: 35,
    lastSeen: "в сети",
  },
  {
    id: "3",
    nick: "lowELO_gigachad",
    realName: "Макс",
    avatar: "/player-3.webp",
    game: "cs2",
    rank: "Legendary Eagle",
    role: "Entry Fragger",
    kd: 1.12,
    winrate: 54,
    hours: 2100,
    online: false,
    tags: ["Врываюсь первым", "Мемы", "Вечерами"],
    bio: "Захожу вечером после работы, играю чилл, но за победу рублюсь.",
    tgUsername: "max_entry",
    vibe: 79,
    level: 21,
    lastSeen: "12 мин назад",
  },
  {
    id: "4",
    nick: "midOrFeed",
    realName: "Дима",
    avatar: "/player-4.webp",
    game: "dota2",
    rank: "Divine 3",
    role: "Мидер",
    kd: 0,
    winrate: 61,
    hours: 5400,
    online: true,
    tags: ["Шот-коллы", "Патимейт", "Ветеран"],
    bio: "5.4к часов в доте, зову на ранкед пати. Понимаю игру, не флеймлю.",
    tgUsername: "dima_mid",
    vibe: 85,
    level: 58,
    lastSeen: "в сети",
  },
  {
    id: "5",
    nick: "GODLIKE_donator",
    realName: "Кирилл",
    avatar: "/player-1.webp",
    game: "cs2",
    rank: "Global Elite",
    role: "IGL",
    kd: 1.42,
    winrate: 71,
    hours: 6100,
    online: true,
    tags: ["Топ-донатер", "PRO", "Стример"],
    bio: "Задонатил больше всех в Nexus. Беру к себе в состав только серьёзных.",
    tgUsername: "kirill_igl",
    vibe: 97,
    level: 88,
    lastSeen: "в сети",
    locked: true,
    unlockStars: 10,
    reason: "donor",
  },
  {
    id: "6",
    nick: "old_school_vet",
    realName: "Сергей",
    avatar: "/player-4.webp",
    game: "cs2",
    rank: "Legendary Eagle Master",
    role: "Support",
    kd: 1.18,
    winrate: 64,
    hours: 9800,
    online: false,
    tags: ["9.8k часов", "Ветеран", "Спокойный"],
    bio: "Играю с 1.6. Опыта вагон, научу позиционке и раскидкам.",
    tgUsername: "serega_vet",
    vibe: 91,
    level: 76,
    lastSeen: "3 ч назад",
    locked: true,
    unlockStars: 8,
    reason: "veteran",
  },
  {
    id: "7",
    nick: "noscope_boy",
    realName: "Влад",
    avatar: "/player-3.webp",
    game: "valorant",
    rank: "Ascendant 1",
    role: "Флэш",
    kd: 1.09,
    winrate: 55,
    hours: 1400,
    online: true,
    tags: ["Молодой", "Быстрый", "Учусь"],
    bio: "Хочу в стак, готов слушать шот-коллы и фармить ранг.",
    tgUsername: "vlad_flash",
    vibe: 73,
    level: 14,
    lastSeen: "в сети",
  },
]

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
  fav_games?: string
}

export const teams: Team[] = [
  {
    id: "t1",
    name: "Night Owls",
    tag: "NOWL",
    game: "cs2",
    needRole: "Support / Lurker",
    minRank: "Supreme+",
    members: 4,
    maxMembers: 5,
    region: "EU / CIS",
    vibe: ["Играем по вечерам", "Идём на турнир", "Дисциплина"],
  },
  {
    id: "t2",
    name: "Zero Ping",
    tag: "0PNG",
    game: "valorant",
    needRole: "Контроллер",
    minRank: "Diamond+",
    members: 3,
    maxMembers: 5,
    region: "EU",
    vibe: ["Стак на ранкед", "Голосовой чат", "Ростер на сезон"],
  },
  {
    id: "t3",
    name: "Radiant Wolves",
    tag: "RWLV",
    game: "dota2",
    needRole: "Хард саппорт (5)",
    minRank: "Ancient+",
    members: 4,
    maxMembers: 5,
    region: "CIS",
    vibe: ["MMR гринд", "Без флейма", "Каждый день"],
  },
]

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

export const guides: Guide[] = [
  {
    id: "g1",
    title: "ТОП-10 смок-лайнапов на Mirage за 8 минут",
    game: "cs2",
    cover: "/guide-cs2.webp",
    author: "ProCoach",
    duration: "8:24",
    views: "412K",
    type: "Лайнапы",
    level: "Продвинутый",
  },
  {
    id: "g2",
    title: "Как быстро поднять MMR: гайд по мид-лейну",
    game: "dota2",
    cover: "/guide-moba.webp",
    author: "MidGod",
    duration: "14:02",
    views: "289K",
    type: "Видео",
    level: "Про",
  },
  {
    id: "g3",
    title: "Ротации и зоны высадки — карта на 10 сезон",
    game: "pubg",
    cover: "/guide-br.webp",
    author: "DropMaster",
    duration: "11:47",
    views: "156K",
    type: "Разбор",
    level: "Новичок",
  },
]

export type StarPack = {
  id: string
  stars: number
  bonus?: string
  perk: string
  popular?: boolean
}

export const starPacks: StarPack[] = [
  { id: "p1", stars: 75, perk: "Буст профиля на 24 часа" },
  { id: "p2", stars: 250, perk: "Значок PRO + приоритет в поиске", bonus: "+15%", popular: true },
  { id: "p3", stars: 500, perk: "PRO на месяц + кастомный ник", bonus: "+25%" },
  { id: "p4", stars: 1000, perk: "Всё сразу + анимированная рамка", bonus: "+40%" },
]

export const currentUser = {
  nick: "you_gg",
  realName: "Ты",
  rank: "Supreme Master",
  game: "cs2",
  stars: 340,
  coins: 120, // новая валюта Nexus
  points: 640, // баллы за достижения
  level: 27,
  xp: 68,
  wins: 214,
  friends: 38,
}

/* ---------- Nexus-валюта, кейсы, инвентарь ---------- */

export type Rarity = "common" | "rare" | "epic" | "premium" | "legendary"

export const rarityMeta: Record<Rarity, { label: string; color: string }> = {
  common: { label: "Обычный", color: "var(--muted-foreground)" },
  rare: { label: "Редкий", color: "var(--accent)" },
  epic: { label: "Эпический", color: "var(--stars)" },
  premium: { label: "Премиум", color: "var(--primary)" },
  legendary: { label: "Легендарный", color: "#ffd700" },
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
  kind?: "inventory" | "stars" | "model" | "jet" // тип награды кейса
  stars?: number // количество звёзд для kind === "stars"
  bonuses?: { stars?: number; coins?: number; searches?: number; highlight_hours?: number; premium_days?: number; free_gold_opens?: number }
  jackpot?: boolean // лимитированный джекпот-предмет
  token?: number // номер экземпляра лимитированной модели
  role?: string // роль, выданная за джекпот
}

export type LootCase = {
  id: string
  name: string
  subtitle: string
  image: string
  gold: boolean
  costStars: number // 0 = бесплатный или оплата коинами
  costCoins?: number // стоимость в монетах Nexus
  free: boolean
  dailyLimit: number // сколько открытий в день
  items: CaseItem[]
}

export function caseItemByKey(key: string, lootCases: LootCase[]): CaseItem | undefined {
  for (const c of lootCases) {
    const found = c.items.find((i) => i.key === key)
    if (found) return found
  }
  return undefined
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
    name: "Nexus Basic case",
    subtitle: "Бесплатный ежедневный кейс",
    image: "/case-blue.webp",
    gold: false,
    costStars: 0,
    free: true,
    dailyLimit: 1,
    items: [
      { key: "premium-medium", name: "Премиум средний", desc: "Премиум на 1 день: до 4 открытий кейсов в день (вместо 1), приоритет в поиске тиммейтов, расширенные анкеты игроков", image: "/premium-x4.webp", rarity: "epic", sell: 35, weight: 12, grantsPremium: true },
      { key: "ak47", name: "Скин AK-47", desc: "Коллекционный скин-картинка для твоей анкеты. Показывается в профиле, не влияет на геймплей", image: "/ak47.webp", rarity: "rare", sell: 15, weight: 30 },
      { key: "icon-skull", name: "Череп", desc: "Декоративная иконка для профиля 💀", icon: "💀", rarity: "common", sell: 10, weight: 8 },
      { key: "icon-fire", name: "Пламя", desc: "Декоративная иконка для профиля 🔥", icon: "🔥", rarity: "common", sell: 10, weight: 12 },
      { key: "icon-crown", name: "Корона", desc: "Декоративная иконка для профиля 👑", icon: "👑", rarity: "common", sell: 10, weight: 6 },
      { key: "icon-target", name: "Прицел", desc: "Декоративная иконка для профиля 🎯", icon: "🎯", rarity: "common", sell: 10, weight: 14 },
      { key: "icon-bolt", name: "Молния", desc: "Декоративная иконка для профиля ⚡", icon: "⚡", rarity: "common", sell: 10, weight: 9 },
      { key: "icon-star", name: "Звезда", desc: "Декоративная иконка для профиля ⭐", icon: "⭐", rarity: "common", sell: 10, weight: 9 },
    ],
  },
  {
    id: "jet",
    name: "Nexus Jet case",
    subtitle: "Военный кейс · 1200 монет за открытие",
    image: "/case-jet.webp",
    gold: false,
    costStars: 0,
    costCoins: 1200,
    free: false,
    dailyLimit: 99,
    items: [
      { key: "f16", name: "F-16 Fighting Falcon", desc: "+2000 ⭐ · +20 анкет/день · топ в поиске", image: "/f16.webp", rarity: "legendary", sell: 0, weight: 15, kind: "jet", bonuses: { stars: 2000, searches: 20, highlight_hours: 24 } },
      { key: "f15", name: "F-15 Eagle", desc: "+5000 монет · +10 анкет · топ 2-3 · бесплатное премиум-открытие", image: "/f15.webp", rarity: "epic", sell: 0, weight: 20, kind: "jet", bonuses: { coins: 5000, searches: 10, highlight_hours: 48, free_gold_opens: 1 } },
      { key: "f14", name: "F-14 Tomcat", desc: "+4000 ⭐ · +50 премиум-открытий · +50 анкет · топ-1 на 3 дня", image: "/f14.webp", rarity: "legendary", sell: 0, weight: 10, kind: "jet", bonuses: { stars: 4000, free_gold_opens: 50, searches: 50, highlight_hours: 72 } },
      { key: "premium-medium", name: "Премиум средний", desc: "Премиум на 1 день: до 4 открытий кейсов, приоритет в поиске", image: "/premium-x4.webp", rarity: "epic", sell: 35, weight: 10, grantsPremium: true },
      { key: "ak47", name: "Скин AK-47", desc: "Коллекционный скин-картинка для профиля", image: "/ak47.webp", rarity: "rare", sell: 15, weight: 8 },
      { key: "icon-skull", name: "Череп", desc: "Декоративная иконка 💀", icon: "💀", rarity: "common", sell: 10, weight: 6 },
      { key: "icon-fire", name: "Пламя", desc: "Декоративная иконка 🔥", icon: "🔥", rarity: "common", sell: 10, weight: 6 },
      { key: "icon-crown", name: "Корона", desc: "Декоративная иконка 👑", icon: "👑", rarity: "common", sell: 10, weight: 5 },
      { key: "icon-target", name: "Прицел", desc: "Декоративная иконка 🎯", icon: "🎯", rarity: "common", sell: 10, weight: 7 },
      { key: "icon-bolt", name: "Молния", desc: "Декоративная иконка ⚡", icon: "⚡", rarity: "common", sell: 10, weight: 6 },
      { key: "icon-star", name: "Звезда", desc: "Декоративная иконка ⭐", icon: "⭐", rarity: "common", sell: 10, weight: 7 },
    ],
  },
  {
    id: "gold",
    name: "Nexus Premium",
    subtitle: "Золотой премиальный кейс",
    image: "/case-gold.webp",
    gold: true,
    costStars: 75,
    free: false,
    dailyLimit: 99,
    items: [
      { key: "premium-card", name: "Премиум-анкета", desc: "Максимальный премиум на 1 день: кастомные фото, свой текст и украшения карточки без ограничений, до 4 открытий кейсов, приоритет в поиске, расширенные анкеты игроков", image: "/premium-reveal.webp", rarity: "premium", sell: 100, weight: 40, grantsPremium: true },
      { key: "premium-card-lite", name: "Премиум", desc: "Премиум-статус на 1 день: приоритет в поиске тиммейтов, расширенные анкеты игроков, больше результатов в поиске", image: "/premium-card.webp", rarity: "epic", sell: 45, weight: 22, grantsPremium: true },
      { key: "premium-medium", name: "Премиум средний", desc: "Премиум на 1 день: до 4 открытий кейсов в день (вместо 1), приоритет в поиске тиммейтов, расширенные анкеты игроков", image: "/premium-x4.webp", rarity: "epic", sell: 75, weight: 20, grantsPremium: true },
      { key: "stars-150", name: "150 ⭐", desc: "150 звёзд на баланс", icon: "⭐", rarity: "common", sell: 0, weight: 8, kind: "stars", stars: 150 },
      { key: "stars-400", name: "400 ⭐", desc: "400 звёзд на баланс", icon: "⭐", rarity: "rare", sell: 0, weight: 4, kind: "stars", stars: 400 },
      { key: "stars-1200", name: "1200 ⭐", desc: "1200 звёзд на баланс", icon: "⭐", rarity: "epic", sell: 0, weight: 1.2, kind: "stars", stars: 1200 },
      { key: "nexus-model", name: "Mini Boss bro", desc: "Лимитированная 3D-модель персонажа. Появляется в профиле владельца. Доход: 50-100 ⭐ в день через вкладку «Модель». Можно продать системе за 55 000 ⭐.", icon: "💎", rarity: "legendary", sell: 55000, weight: 0.1, jackpot: true, kind: "model" },
    ],
  },
]

// Магазин: продажа карточек за монетки
export const coinShop: { key: string; name: string; desc: string; image: string; price: number }[] = [
  { key: "buy-premium-card", name: "Премиум-анкета", desc: "Максимальный премиум на 1 день: кастом фото/текст, 4 открытия кейсов, приоритет в поиске", image: "/premium-reveal.webp", price: 100 },
  { key: "buy-premium-lite", name: "Премиум", desc: "Премиум-статус на 1 день: приоритет в поиске, расширенные анкеты игроков", image: "/premium-card.webp", price: 45 },
  { key: "buy-ak47", name: "Скин AK-47", desc: "Коллекционный скин-картинка для профиля", image: "/ak47.webp", price: 18 },
  { key: "buy-premium-medium", name: "Премиум средний", desc: "Премиум на 1 день: до 4 открытий кейсов, приоритет в поиске", image: "/premium-x4.webp", price: 38 },
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

export const achievements: Achievement[] = [
  {
    id: "a1",
    game: "CS:GO",
    title: "Разминка на 35 минут",
    desc: "Сыграй 35 минут в CS:GO",
    minutes: 35,
    progress: 35,
    points: 100,
    coins: 15,
    withTeammate: false,
  },
  {
    id: "a2",
    game: "War Thunder",
    title: "Танковый экипаж",
    desc: "Сыграй 60 минут в War Thunder в отряде с тиммейтом из бота",
    minutes: 60,
    progress: 42,
    points: 150,
    coins: 35,
    withTeammate: true,
  },
  {
    id: "a3",
    game: "Roblox",
    title: "Соседи по Brookhaven",
    desc: "Сыграй 120 минут в Roblox Brookhaven с тиммейтом",
    minutes: 120,
    progress: 30,
    points: 220,
    coins: 65,
    withTeammate: true,
  },
]

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
  type: "coins" | "stars" | "item" | "premium" | "decoration" | "model"
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
export const battlePassPriceStars = 250
export const battlePassXpPerLevel = 100

export const battlePassTiers: BattlePassTier[] = [
  {
    level: 1,
    xp: 100,
    free: { key: "bp1f", name: "50 монет", type: "coins", amount: 50, icon: "🪙" },
    premium: { key: "bp1p", name: "Скин AK-47", type: "item", image: "/ak47.webp", rarity: "rare" },
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
    premium: { key: "bp3p", name: "Премиум средний", type: "item", image: "/premium-x4.webp", rarity: "epic" },
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
    premium: { key: "bp5p", name: "Премиум", type: "item", image: "/premium-card.webp", rarity: "epic" },
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
    premium: { key: "bp9p", name: "Премиум средний", type: "item", image: "/premium-x4.webp", rarity: "epic" },
  },
  {
    level: 10,
    xp: 1000,
    free: { key: "bp10f", name: "100 монет", type: "coins", amount: 100, icon: "🪙" },
    premium: { key: "bp10p", name: "Премиум-анкета", type: "item", image: "/premium-reveal.webp", rarity: "premium" },
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

export const leaderboard: LeaderEntry[] = [
  { id: "l1", nick: "s1mple_wannabe", avatar: "/player-1.webp", stars: 12400, coins: 3200, premium: true },
  { id: "l2", nick: "midOrFeed", avatar: "/player-4.webp", stars: 9850, coins: 2100, premium: true },
  { id: "l3", nick: "cyberKitty", avatar: "/player-2.webp", stars: 7200, coins: 1800, premium: true },
  { id: "l4", nick: "lowELO_gigachad", avatar: "/player-3.webp", stars: 4300, coins: 950, premium: false },
  { id: "l5", nick: "malchik_tanchik", avatar: "/player-1.webp", stars: 3100, coins: 600, premium: false },
  { id: "l6", nick: "you_gg", avatar: "/player-2.webp", stars: 340, coins: 120, premium: false },
  { id: "l7", nick: "noscope_boy", avatar: "/player-3.webp", stars: 180, coins: 40, premium: false },
]
