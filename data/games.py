GAMES = {
    "cs2": {
        "title": "Counter-Strike 2",
        "emoji": "🔫",
        "ranks": ["Silver", "Gold Nova", "MG", "DMG", "LE", "LEM", "Supreme", "Global Elite", "Faceit 1-3", "Faceit 4-7", "Faceit 8-10"],
        "roles": ["AWPer", "Entry", "Support", "IGL", "Lurker", "Универсал"],
    },
    "roblox": {
        "title": "Roblox",
        "emoji": "🧱",
        "ranks": ["Новичок", "Средний", "Опытный", "Про"],
        "roles": ["Лидер", "Билдер", "Скриптер", "Дизайнер", "PvP", "Ролевик"],
    },
    "wot": {
        "title": "World of Tanks",
        "emoji": "🛡️",
        "ranks": ["Новичок", "Бронза", "Серебро", "Золото", "Платина", "Алмаз", "Мастер"],
        "roles": ["Тяжёлый", "Средний", "ЛТ", "ПТ-САУ", "САУ", "Универсал"],
    },
    "wt": {
        "title": "War Thunder",
        "emoji": "✈️",
        "ranks": ["Новичок", "Ранк 3-4", "Ранк 5-6", "Ранк 7-8", "Топ-ранк"],
        "roles": ["Истребитель", "Штурмовик", "Бомбардировщик", "Танки", "Вертолёты", "Смешанный"],
    },
    "dota2": {
        "title": "Dota 2",
        "emoji": "⚔️",
        "ranks": ["Herald", "Guardian", "Crusader", "Archon", "Legend", "Ancient", "Divine", "Immortal"],
        "roles": ["Керри", "Мид", "Оффлейн", "Саппорт 4", "Саппорт 5", "Капитан"],
    },
    "valorant": {
        "title": "Valorant",
        "emoji": "🎯",
        "ranks": ["Iron", "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Ascendant", "Immortal", "Radiant"],
        "roles": ["Дуэлянт", "Инициатор", "Контроллер", "Сентинел", "IGL"],
    },
    "minecraft": {
        "title": "Minecraft",
        "emoji": "⛏️",
        "ranks": ["Казуал", "Опытный", "Хардкор"],
        "roles": ["Билдер", "Редстоун", "PvP", "Фарм", "Ивенты", "Выживание"],
    },
    "fortnite": {
        "title": "Fortnite",
        "emoji": "🏗️",
        "ranks": ["0-1000", "1000-3000", "3000-5000", "5000-8000", "8000+"],
        "roles": ["Шотганер", "Билдер", "IGL", "Саппорт", "Снайпер"],
    },
    "apex": {
        "title": "Apex Legends",
        "emoji": "🔥",
        "ranks": ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Master", "Predator"],
        "roles": ["Entry", "Support", "Flex", "IGL"],
    },
    "rust": {
        "title": "Rust",
        "emoji": "🪓",
        "ranks": ["Новичок", "100ч+", "500ч+", "1000ч+"],
        "roles": ["Рейдер", "Фармер", "Билдер", "Электрик", "PvP"],
    },
}

LOOKING_FOR = {
    "team": "👥 Команду",
    "duo": "🤝 Дуо/трио",
    "clan": "🏰 Клан",
    "coach": "🎓 Тренера",
}

PLAYTIME = {
    "1-2": "1-2 ч/день",
    "3-4": "3-4 ч/день",
    "5+": "5+ ч/день",
    "weekend": "Только выходные",
}

BATTLE_PASS_PRICE_STARS = 250
BATTLE_PASS_XP_PER_LEVEL = 100

BATTLE_PASS_TIERS = [
    {"level": 1, "xp": 100, "free": {"key": "bp1f", "name": "50 монет", "type": "coins", "amount": 50, "icon": "🪙"}, "premium": {"key": "bp1p", "name": "Скин AK-47", "type": "item", "image": "/ak47.png", "rarity": "rare"}},
    {"level": 2, "xp": 200, "free": {"key": "bp2f", "name": "Иконка «Пламя»", "type": "item", "icon": "🔥", "rarity": "common"}, "premium": {"key": "bp2p", "name": "120 монет", "type": "coins", "amount": 120, "icon": "🪙"}},
    {"level": 3, "xp": 300, "free": None, "premium": {"key": "bp3p", "name": "Премиум средний", "type": "item", "image": "/premium-x4.png", "rarity": "epic"}},
    {"level": 4, "xp": 400, "free": {"key": "bp4f", "name": "25 звёзд", "type": "stars", "amount": 25, "icon": "⭐"}, "premium": {"key": "bp4p", "name": "Украшение «Cyber»", "type": "decoration", "amount": 0, "icon": "✨"}},
    {"level": 5, "xp": 500, "free": {"key": "bp5f", "name": "Иконка «Корона»", "type": "item", "icon": "👑", "rarity": "common"}, "premium": {"key": "bp5p", "name": "Премиум", "type": "item", "image": "/premium-card.png", "rarity": "epic"}},
    {"level": 6, "xp": 600, "free": None, "premium": {"key": "bp6p", "name": "200 монет", "type": "coins", "amount": 200, "icon": "🪙"}},
    {"level": 7, "xp": 700, "free": {"key": "bp7f", "name": "35 монет", "type": "coins", "amount": 35, "icon": "🪙"}, "premium": {"key": "bp7p", "name": "Украшение «Blood»", "type": "decoration", "amount": 0, "icon": "✨"}},
    {"level": 8, "xp": 800, "free": {"key": "bp8f", "name": "Иконка «Молния»", "type": "item", "icon": "⚡", "rarity": "common"}, "premium": {"key": "bp8p", "name": "50 звёзд", "type": "stars", "amount": 50, "icon": "⭐"}},
    {"level": 9, "xp": 900, "free": None, "premium": {"key": "bp9p", "name": "Премиум средний", "type": "item", "image": "/premium-x4.png", "rarity": "epic"}},
    {"level": 10, "xp": 1000, "free": {"key": "bp10f", "name": "100 монет", "type": "coins", "amount": 100, "icon": "🪙"}, "premium": {"key": "bp10p", "name": "Премиум-анкета", "type": "item", "image": "/premium-reveal.png", "rarity": "premium"}},
]

DAILY_STREAK_REWARDS = [
    {"day": 1, "coins": 10},
    {"day": 2, "coins": 20},
    {"day": 3, "coins": 35},
    {"day": 4, "coins": 50},
    {"day": 5, "coins": 75},
    {"day": 6, "coins": 100},
    {"day": 7, "coins": 200},
]

REFERRAL_REWARD = {"coins": 50, "stars": 5}

# Пакеты монет за Telegram Stars (магазин Nexus)
COIN_PACKS = [
    {"id": "c1", "coins": 50, "stars": 25},
    {"id": "c2", "coins": 120, "stars": 50},
    {"id": "c3", "coins": 300, "stars": 100},
]

# Стартовые промокоды (сидируются в БД при старте)
DEFAULT_PROMO_CODES = [
    {"code": "NEXUS2026", "reward": {"coins": 100, "stars": 10}, "max_uses": 1000},
    {"code": "WELCOME", "reward": {"coins": 50, "stars": 0}, "max_uses": 5000},
    {"code": "GGWP", "reward": {"coins": 30, "stars": 5, "xp": 50}, "max_uses": 500},
]
