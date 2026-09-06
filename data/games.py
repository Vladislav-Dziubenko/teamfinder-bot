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

BATTLE_PASS_PRICE_STARS = 125
BATTLE_PASS_XP_PER_LEVEL = 100
# Мгновенный забор тира без ожидания 48ч (только премиум-пасс): цена за 1 уровень.
BP_INSTANT_CLAIM_STARS_PER_TIER = 50

# Nexus Autumn Battle Pass — 30 tiers, 2 tracks (free + premium)
BATTLE_PASS_TIERS = [
    # Tier 1-5: стартовые награды
    {"level": 1, "xp": 100, "free": {"key": "bp1f", "name": "50 монет", "type": "coins", "amount": 50, "icon": "🪙"}, "premium": {"key": "bp1p", "name": "Autumn Leaf", "type": "item", "icon": "🍂", "rarity": "common"}},
    {"level": 2, "xp": 200, "free": {"key": "bp2f", "name": "Иконка «Клён»", "type": "item", "icon": "🍁", "rarity": "common"}, "premium": {"key": "bp2p", "name": "120 монет", "type": "coins", "amount": 120, "icon": "🪙"}},
    {"level": 3, "xp": 300, "free": None, "premium": {"key": "bp3p", "name": "25 ⭐", "type": "stars", "amount": 25, "icon": "⭐"}},
    {"level": 4, "xp": 400, "free": {"key": "bp4f", "name": "40 монет", "type": "coins", "amount": 40, "icon": "🪙"}, "premium": {"key": "bp4p", "name": "Harvest Moon", "type": "item", "icon": "🌕", "rarity": "common"}},
    {"level": 5, "xp": 500, "free": {"key": "bp5f", "name": "Иконка «Тыква»", "type": "item", "icon": "🎃", "rarity": "common"}, "premium": {"key": "bp5p", "name": "Maple Spirit", "type": "item", "icon": "🍁", "rarity": "rare"}},

    # Tier 6-10: первые ключи и звёзды
    {"level": 6, "xp": 600, "free": None, "premium": {"key": "bp6p", "name": "75 монет", "type": "coins", "amount": 75, "icon": "🪙"}},
    {"level": 7, "xp": 700, "free": {"key": "bp7f", "name": "15 ⭐", "type": "stars", "amount": 15, "icon": "⭐"}, "premium": {"key": "bp7p", "name": "Ember Crown", "type": "item", "icon": "👑", "rarity": "rare"}},
    {"level": 8, "xp": 800, "free": None, "premium": {"key": "bp8p", "name": "Autumn Key", "type": "item", "icon": "🗝️", "rarity": "epic"}},
    {"level": 9, "xp": 900, "free": {"key": "bp9f", "name": "60 монет", "type": "coins", "amount": 60, "icon": "🪙"}, "premium": {"key": "bp9p", "name": "50 ⭐", "type": "stars", "amount": 50, "icon": "⭐"}},
    {"level": 10, "xp": 1000, "free": {"key": "bp10f", "name": "Иконка «Призрак»", "type": "item", "icon": "👻", "rarity": "common"}, "premium": {"key": "bp10p", "name": "Cinderwing MK-II", "type": "item", "icon": "△", "rarity": "epic"}},

    # Tier 11-15: более ценные награды
    {"level": 11, "xp": 1100, "free": None, "premium": {"key": "bp11p", "name": "100 монет", "type": "coins", "amount": 100, "icon": "🪙"}},
    {"level": 12, "xp": 1200, "free": {"key": "bp12f", "name": "20 ⭐", "type": "stars", "amount": 20, "icon": "⭐"}, "premium": {"key": "bp12p", "name": "Pumpkin Guardian", "type": "item", "icon": "🎃", "rarity": "epic"}},
    {"level": 13, "xp": 1300, "free": None, "premium": {"key": "bp13p", "name": "Autumn Key", "type": "item", "icon": "🗝️", "rarity": "epic"}},
    {"level": 14, "xp": 1400, "free": {"key": "bp14f", "name": "80 монет", "type": "coins", "amount": 80, "icon": "🪙"}, "premium": {"key": "bp14p", "name": "Maple Warden", "type": "item", "icon": "⬡", "rarity": "epic"}},
    {"level": 15, "xp": 1500, "free": {"key": "bp15f", "name": "Иконка «Огонь»", "type": "item", "icon": "🔥", "rarity": "common"}, "premium": {"key": "bp15p", "name": "100 ⭐", "type": "stars", "amount": 100, "icon": "⭐"}},

    # Tier 16-20: премиум-контент
    {"level": 16, "xp": 1600, "free": None, "premium": {"key": "bp16p", "name": "150 монет", "type": "coins", "amount": 150, "icon": "🪙"}},
    {"level": 17, "xp": 1700, "free": {"key": "bp17f", "name": "30 ⭐", "type": "stars", "amount": 30, "icon": "⭐"}, "premium": {"key": "bp17p", "name": "Verdant Singularity", "type": "item", "image": "/verdant.webp", "rarity": "legendary"}},
    {"level": 18, "xp": 1800, "free": None, "premium": {"key": "bp18p", "name": "Autumn Key", "type": "item", "icon": "🗝️", "rarity": "epic"}},
    {"level": 19, "xp": 1900, "free": {"key": "bp19f", "name": "100 монет", "type": "coins", "amount": 100, "icon": "🪙"}, "premium": {"key": "bp19p", "name": "Премиум средний", "type": "item", "image": "/premium-x4.webp", "rarity": "epic"}},
    {"level": 20, "xp": 2000, "free": {"key": "bp20f", "name": "Иконка «Щит»", "type": "item", "icon": "🛡️", "rarity": "common"}, "premium": {"key": "bp20p", "name": "200 ⭐", "type": "stars", "amount": 200, "icon": "⭐"}},

    # Tier 21-25: финальные ключи
    {"level": 21, "xp": 2100, "free": None, "premium": {"key": "bp21p", "name": "200 монет", "type": "coins", "amount": 200, "icon": "🪙"}},
    {"level": 22, "xp": 2200, "free": {"key": "bp22f", "name": "40 ⭐", "type": "stars", "amount": 40, "icon": "⭐"}, "premium": {"key": "bp22p", "name": "Autumn Key", "type": "item", "icon": "🗝️", "rarity": "epic"}},
    {"level": 23, "xp": 2300, "free": None, "premium": {"key": "bp23p", "name": "Премиум", "type": "item", "image": "/premium-card.webp", "rarity": "epic"}},
    {"level": 24, "xp": 2400, "free": {"key": "bp24f", "name": "150 монет", "type": "coins", "amount": 150, "icon": "🪙"}, "premium": {"key": "bp24p", "name": "Autumn Key", "type": "item", "icon": "🗝️", "rarity": "epic"}},
    {"level": 25, "xp": 2500, "free": {"key": "bp25f", "name": "Иконка «Лист»", "type": "item", "icon": "🍂", "rarity": "common"}, "premium": {"key": "bp25p", "name": "300 ⭐", "type": "stars", "amount": 300, "icon": "⭐"}},

    # Tier 26-30: гранд-финал
    {"level": 26, "xp": 2600, "free": None, "premium": {"key": "bp26p", "name": "250 монет", "type": "coins", "amount": 250, "icon": "🪙"}},
    {"level": 27, "xp": 2700, "free": {"key": "bp27f", "name": "50 ⭐", "type": "stars", "amount": 50, "icon": "⭐"}, "premium": {"key": "bp27p", "name": "Autumn Key", "type": "item", "icon": "🗝️", "rarity": "epic"}},
    {"level": 28, "xp": 2800, "free": None, "premium": {"key": "bp28p", "name": "Премиум-анкета", "type": "item", "image": "/premium-reveal.webp", "rarity": "premium"}},
    {"level": 29, "xp": 2900, "free": {"key": "bp29f", "name": "200 монет", "type": "coins", "amount": 200, "icon": "🪙"}, "premium": {"key": "bp29p", "name": "Autumn Key ×2", "type": "item", "icon": "🗝️", "rarity": "epic"}},
    {"level": 30, "xp": 3000, "free": {"key": "bp30f", "name": "Иконка «Страж»", "type": "item", "icon": "🛡️", "rarity": "common"}, "premium": {"key": "bp30p", "name": "AURELIA // 09", "desc": "Легендарная модель. Солнечное ядро, запечатанное в чёрном стекле. Лимит 10 шт. Доход 50-100 ⭐/день", "type": "model", "model_id": "aurelia-09", "image": "/aurelia.webp", "rarity": "legendary"}},
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

# Мгновенный бонус пригласившему прямо при вводе кода (до «созревания» анкеты).
# Маленький, чтобы не окупался фрод альтов, но даёт дофамин пригласившему.
REFERRAL_INSTANT_REWARD = {"coins": 15}

# Инвайт-лестница: скин/голд-кейс за число приглашённых друзей (каждая ступень один раз)
REFERRAL_LADDER = [
    {"invites": 1, "key": "ladder-ak47", "name": "Скин AK-47 (инвайт)", "rarity": "rare", "image": "/ak47.webp", "sell": 15},
    {"invites": 3, "key": "ladder-gold", "name": "Бесплатный голд-кейс (инвайт)", "rarity": "epic", "image": "/case-gold.webp", "free_gold_opens": 1},
    {"invites": 5, "key": "ladder-premium", "name": "Премиум-анкета (инвайт)", "rarity": "premium", "image": "/premium-reveal.webp", "sell": 100},
    {"invites": 8, "key": "ladder-nexus", "name": "Премиум средний (инвайт)", "rarity": "epic", "image": "/premium-x4.webp", "sell": 75},
]

# Пакеты монет за Telegram Stars (магазин Nexus)
COIN_PACKS = [
    {"id": "c1", "coins": 50, "stars": 13},
    {"id": "c2", "coins": 120, "stars": 25},
    {"id": "c3", "coins": 300, "stars": 50},
]

# Стартовые промокоды (сидируются в БД при старте)
DEFAULT_PROMO_CODES = [
    {"code": "NEXUS2026", "reward": {"coins": 100, "stars": 10}, "max_uses": 1000},
    {"code": "WELCOME", "reward": {"coins": 50, "stars": 0}, "max_uses": 5000},
    {"code": "GGWP", "reward": {"coins": 30, "stars": 5, "xp": 50}, "max_uses": 500},
]
