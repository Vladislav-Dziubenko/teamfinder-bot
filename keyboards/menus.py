from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup, KeyboardButton
from data.games import GAMES, LOOKING_FOR, PLAYTIME
from data.guides import GUIDES


def main_menu() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="🎮 Найти команду"), KeyboardButton(text="📝 Моя анкета")],
            [KeyboardButton(text="📚 Гайды"), KeyboardButton(text="⭐ Премиум")],
            [KeyboardButton(text="ℹ️ Помощь")],
        ],
        resize_keyboard=True,
    )


def games_keyboard(prefix: str) -> InlineKeyboardMarkup:
    rows = []
    row = []
    for key, game in GAMES.items():
        row.append(InlineKeyboardButton(text=f"{game['emoji']} {game['title']}", callback_data=f"{prefix}:game:{key}"))
        if len(row) == 2:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    return InlineKeyboardMarkup(inline_keyboard=rows)


def list_from_dict(items: dict, prefix: str, step: str) -> InlineKeyboardMarkup:
    rows = []
    for key, label in items.items():
        rows.append([InlineKeyboardButton(text=label, callback_data=f"{prefix}:{step}:{key}")])
    rows.append([InlineKeyboardButton(text="❌ Отмена", callback_data=f"{prefix}:cancel")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def ranks_keyboard(game: str, prefix: str) -> InlineKeyboardMarkup:
    ranks = GAMES[game]["ranks"]
    rows = [[InlineKeyboardButton(text=r, callback_data=f"{prefix}:rank:{r}")] for r in ranks]
    rows.append([InlineKeyboardButton(text="❌ Отмена", callback_data=f"{prefix}:cancel")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def roles_keyboard(game: str, prefix: str) -> InlineKeyboardMarkup:
    roles = GAMES[game]["roles"]
    rows = [[InlineKeyboardButton(text=r, callback_data=f"{prefix}:role:{r}")] for r in roles]
    rows.append([InlineKeyboardButton(text="❌ Отмена", callback_data=f"{prefix}:cancel")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def playtime_keyboard(prefix: str) -> InlineKeyboardMarkup:
    return list_from_dict(PLAYTIME, prefix, "playtime")


def looking_keyboard(prefix: str) -> InlineKeyboardMarkup:
    return list_from_dict(LOOKING_FOR, prefix, "looking")


def mic_keyboard(prefix: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🎤 Есть микрофон", callback_data=f"{prefix}:mic:1")],
        [InlineKeyboardButton(text="🔇 Без микрофона", callback_data=f"{prefix}:mic:0")],
        [InlineKeyboardButton(text="❌ Отмена", callback_data=f"{prefix}:cancel")],
    ])


def profile_actions() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="✏️ Изменить анкету", callback_data="profile:edit")],
        [InlineKeyboardButton(text="🔍 Искать по моей игре", callback_data="profile:search")],
        [InlineKeyboardButton(text="🚀 Поднять в топ (7⭐)", callback_data="pay:highlight")],
        [InlineKeyboardButton(text="🗑 Скрыть анкету", callback_data="profile:hide")],
    ])


def search_results_keyboard(matches: list[tuple[int, int]], premium: bool) -> InlineKeyboardMarkup:
    rows = []
    for user_id, score in matches[:5]:
        label = f"👤 Анкета ({score}%)" if premium else "👤 Анкета"
        rows.append([InlineKeyboardButton(text=label, callback_data=f"contact:{user_id}")])
    if not premium:
        rows.append([InlineKeyboardButton(text="⭐ Лучший подбор за 5 Stars", callback_data="pay:best_team")])
    rows.append([InlineKeyboardButton(text="🔄 Обновить", callback_data="search:refresh")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def guides_menu() -> InlineKeyboardMarkup:
    rows = []
    for key, game in GAMES.items():
        count = sum(1 for g in GUIDES if g["game"] == key)
        if count:
            rows.append([InlineKeyboardButton(text=f"{game['emoji']} {game['title']} ({count})", callback_data=f"guides:game:{key}")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def guides_list(game: str, unlocked: set[str]) -> InlineKeyboardMarkup:
    rows = []
    for g in GUIDES:
        if g["game"] != game:
            continue
        if g["type"] == "free" or g["id"] in unlocked:
            prefix = "📖"
        elif g["type"] == "video":
            prefix = "🎬"
        else:
            prefix = f"⭐{g['stars']}"
        rows.append([InlineKeyboardButton(text=f"{prefix} {g['title']}", callback_data=f"guides:view:{g['id']}")])
    rows.append([InlineKeyboardButton(text="⬅️ Назад", callback_data="guides:back")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def guide_actions(guide_id: str, guide: dict, unlocked: bool) -> InlineKeyboardMarkup:
    rows = []
    if not unlocked and guide["stars"] > 0:
        rows.append([InlineKeyboardButton(text=f"⭐ Купить за {guide['stars']} Stars", callback_data=f"pay:guide:{guide_id}")])
    if guide.get("video_url") and unlocked:
        rows.append([InlineKeyboardButton(text="▶️ Смотреть видео", url=guide["video_url"])])
    rows.append([InlineKeyboardButton(text="⬅️ Назад", callback_data=f"guides:game:{guide['game']}")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def premium_menu(price_team: int, price_highlight: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=f"🏆 Лучший подбор команд — {price_team}⭐", callback_data="pay:best_team")],
        [InlineKeyboardButton(text=f"🚀 Поднять анкету в топ — {price_highlight}⭐", callback_data="pay:highlight")],
        [InlineKeyboardButton(text="📚 Премиум-гайды", callback_data="guides:back")],
    ])
