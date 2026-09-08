export const CURRENT_VERSION = "1.7"
export const STORAGE_KEY = "nexus_last_seen_version"

export interface ChangelogItem {
  version: string
  date: string
  isMajor: boolean
  title: { en: string; ru: string }
  items: { en: string[]; ru: string[] }
}

export const updates: ChangelogItem[] = [
  {
    version: "1.7",
    date: "9 Sep 2026",
    isMajor: true,
    title: { en: "Clans: teams, quests & seasons", ru: "Кланы: команды, квесты и сезоны" },
    items: {
      en: [
        "🛡️ Clans up to 15 members: leader, officers, invites",
        "⭐ Clan points for cases, quests and activity",
        "📆 Daily and weekly clan quests with progress bars",
        "🏆 Monthly season: two leaderboards, top-10% rewards",
        "💬 Clan chat, 🏦 clan bank and shop",
      ],
      ru: [
        "🛡️ Кланы до 15 участников: лидер, офицеры, инвайты",
        "⭐ Очки клану за кейсы, квесты и активность",
        "📆 Дневные и недельные квесты с прогресс-барами",
        "🏆 Месячный сезон: два лидерборда, награды топ-10%",
        "💬 Чат клана, 🏦 банк и магазин",
      ],
    },
  },
  {
    version: "1.6",
    date: "8 Sep 2026",
    isMajor: true,
    title: { en: "Super+ subscription & profile style", ru: "Подписка Super+ и своё оформление" },
    items: {
      en: [
        "👑 Super+ subscription ($15/mo): orange-gold status, beta, early access, PRO",
        "🎁 Super+ weekly drops: coins, Stars and Autumn Keys",
        "🎨 Custom style (beta): nick color, message frames, card background, drawn avatar",
        "🤖 /ask — ask the AI anything in bot DMs",
        "📋 Slash-command hints: trimmed for players, full for admins",
      ],
      ru: [
        "👑 Подписка Super+ ($15/мес): оранжево-золотой статус, бета, ранний доступ, PRO",
        "🎁 Еженедельные дропы Super+: монеты, звёзды и ключи Autumn",
        "🎨 Своё оформление (бета): цвет ника, рамки, фон карточки, рисованная аватарка",
        "🤖 /ask — спроси ИИ что угодно в личке бота",
        "📋 Подсказки команд по /: обрезанные игрокам, полные админам",
      ],
    },
  },
  {
    version: "1.5",
    date: "8 Sep 2026",
    isMajor: true,
    title: { en: "AI Guard, /ask & chat fixes", ru: "ИИ-Страж, /ask и фиксы чата" },
    items: {
      en: [
        "🛡️ AI Guard in global chat: mention «guardian» and it replies (keeps order too)",
        "🤖 New /ask command — ask the AI anything in bot DMs",
        "⬇️ Scroll-to-bottom arrow in chat, no more message flickering",
        "🌐 Fixed message translation (🌐 button on messages)",
        "📋 Slash-command hints: trimmed for players, full for admins",
      ],
      ru: [
        "🛡️ ИИ-Страж в общем чате: позови «страж» — ответит (и за порядком следит)",
        "🤖 Новая команда /ask — спроси ИИ что угодно в личке бота",
        "⬇️ Стрелка «вниз» в чате, починено моргание сообщений",
        "🌐 Починен перевод сообщений (кнопка 🌐 на сообщении)",
        "📋 Подсказки команд по /: обрезанные игрокам, полные админам",
      ],
    },
  },
  {
    version: "1.4",
    date: "6 Sep 2026",
    isMajor: true,
    title: { en: "Autumn Cases, Keys & Instant Pass", ru: "Осенние кейсы, ключи и мгновенный пасс" },
    items: {
      en: [
        "New cases: Nexus Autumn Case + Autumn Gold (3 keys to open)",
        "3 legendary models: AURELIA // 09, NOCTURNE REAPER, VERDANT SINGULARITY",
        "Autumn Keys (0.5% drop) with 0/3 progress widget",
        "Battle pass completes once — no second run",
        "Instant tier claim for stars (premium, 50 ⭐ per tier)",
        "Star drops rebalanced to ~1.5% — win-or-lose gamble",
        "Fixed key spending and multi-model jackpot roll",
      ],
      ru: [
        "Новые кейсы: Nexus Autumn Case + Autumn Gold (открытие за 3 ключа)",
        "3 легендарные модели: AURELIA // 09, NOCTURNE REAPER, VERDANT SINGULARITY",
        "Ключи Autumn (дроп 0.5%) с виджетом прогресса 0/3",
        "Батл-пасс проходится один раз — второй круг закрыт",
        "Мгновенный забор тиров за звёзды (премиум, 50 ⭐ за уровень)",
        "Шанс звёзд снижен до ~1.5% — азарт: в минус или в плюс",
        "Пофикшено списание ключей и джекпот-ролл нескольких моделей",
      ],
    },
  },
  {
    version: "1.3",
    date: "6 Sep 2026",
    isMajor: true,
    title: { en: "Nexus Autumn — Season Event", ru: "Nexus Autumn — осенний сезон" },
    items: {
      en: [
        "Season event hub (1 Sep – 30 Nov) with live countdown",
        "Seasonal Battle Pass showcase",
        "Autumn cases with quick open",
        "Event collection: inventory and 3D models",
      ],
      ru: [
        "Хаб сезонного ивента (1 сен – 30 ноя) с живым таймером",
        "Витрина сезонного боевого пропуска",
        "Осенние кейсы с быстрым открытием",
        "Коллекция события: инвентарь и 3D-модели",
      ],
    },
  },
  {
    version: "1.2",
    date: "6 Sep 2026",
    isMajor: true,
    title: { en: "Voice Chat & Kick", ru: "Голосовой чат и кик" },
    items: {
      en: [
        "Real-time voice chat with WebRTC",
        "Kick players from sessions",
        "Telegram stickers in global chat",
        "Voice messages in chat",
        "Case weight rebalance",
        "Bug fixes and performance improvements",
      ],
      ru: [
        "Голосовой чат на WebRTC в реальном времени",
        "Кик игроков из сессий",
        "Стикеры Telegram в глобальном чате",
        "Голосовые сообщения в чате",
        "Перебалансировка весов кейсов",
        "Исправления багов и улучшение производительности",
      ],
    },
  },
  {
    version: "1.1",
    date: "1 Sep 2026",
    isMajor: false,
    title: { en: "Marketplace & Cases", ru: "Маркетплейс и кейсы" },
    items: {
      en: [
        "Player marketplace — buy and sell items",
        "Loot cases with animated opening",
        "Battle Pass system",
        "Premium subscriptions",
        "3D model inventory",
      ],
      ru: [
        "Маркетплейс игроков — покупка и продажа предметов",
        "Лут-кейсы с анимированным открытием",
        "Система Battle Pass",
        "Премиум подписки",
        "Инвентарь 3D моделей",
      ],
    },
  },
  {
    version: "1.0",
    date: "25 Aug 2026",
    isMajor: true,
    title: { en: "NEXUS TeamHub Launch", ru: "Запуск NEXUS TeamHub" },
    items: {
      en: [
        "Find teammates for CS2, Dota 2, Valorant and more",
        "Global chat with real-time messaging",
        "Player profiles with stats",
        "Friend system",
        "Leaderboards",
      ],
      ru: [
        "Поиск тиммейтов для CS2, Dota 2, Valorant и других",
        "Глобальный чат с сообщениями в реальном времени",
        "Профили игроков со статистикой",
        "Система друзей",
        "Таблица лидеров",
      ],
    },
  },
]

export function hasNewUpdate(lastSeenVersion: string | null): boolean {
  if (!lastSeenVersion) return true
  return CURRENT_VERSION !== lastSeenVersion
}

export function hasMajorUpdate(lastSeenVersion: string | null): boolean {
  if (!lastSeenVersion) {
    const latest = updates[0]
    return latest?.isMajor ?? false
  }
  // Проверяем ТОЛЬКО последнюю версию — если она major и ещё не просмотрена
  const latest = updates[0]
  if (!latest) return false
  return latest.isMajor && latest.version !== lastSeenVersion
}
