import random
from aiogram import Router, F
from aiogram.types import Message, InlineKeyboardButton, InlineKeyboardMarkup

from database import Database
from keyboards.menus import main_menu

router = Router()

# Case configuration
CASES_CONFIG = {
    "blue": {
        "id": "blue",
        "name": "Nexus Counter Strike 1.6",
        "subtitle": "Бесплатный ежедневный кейс",
        "cost_stars": 0,
        "free": True,
        "daily_limit": 4,
        "items": [
            {"key": "premium-medium", "name": "Премиум средний", "rarity": "epic", "sell": 75, "weight": 8, "grants_premium": True},
            {"key": "ak47", "name": "Скин AK-47", "rarity": "rare", "sell": 35, "weight": 14},
            {"key": "icon-skull", "name": "Череп", "rarity": "common", "sell": 20, "weight": 10},
            {"key": "icon-fire", "name": "Пламя", "rarity": "common", "sell": 20, "weight": 10},
            {"key": "icon-crown", "name": "Корона", "rarity": "common", "sell": 20, "weight": 10},
            {"key": "icon-target", "name": "Прицел", "rarity": "common", "sell": 20, "weight": 10},
            {"key": "icon-bolt", "name": "Молния", "rarity": "common", "sell": 20, "weight": 10},
            {"key": "icon-star", "name": "Звезда", "rarity": "common", "sell": 20, "weight": 10},
        ]
    },
    "gold": {
        "id": "gold",
        "name": "Nexus Premium",
        "subtitle": "Золотой премиальный кейс",
        "cost_stars": 150,
        "free": False,
        "daily_limit": 99,
        "items": [
            {"key": "premium-card", "name": "Премиум-анкета", "rarity": "premium", "sell": 200, "weight": 60, "grants_premium": True},
            {"key": "premium-card-lite", "name": "Премиум", "rarity": "epic", "sell": 90, "weight": 40, "grants_premium": True},
        ]
    }
}

RARITY_EMOJI = {
    "common": "⚪",
    "rare": "🔵",
    "epic": "🟣",
    "premium": "🟡"
}


def roll_item(case_id: str):
    case = CASES_CONFIG.get(case_id)
    if not case:
        return None
    total = sum(item["weight"] for item in case["items"])
    r = random.random() * total
    for item in case["items"]:
        r -= item["weight"]
        if r <= 0:
            return item
    return case["items"][-1]


@router.message(F.text == "🎁 Кейсы")
async def cmd_cases(message: Message, db: Database):
    user_id = message.from_user.id
    
    text = "🎁 <b>Кейсы Nexus</b>\n\n"
    
    for case_id, case in CASES_CONFIG.items():
        opens_today = await db.get_case_opens_today(user_id, case_id)
        left = max(0, case["daily_limit"] - opens_today) if case["free"] else None
        
        text += f"{RARITY_EMOJI.get('premium' if case_id == 'gold' else 'epic')} <b>{case['name']}</b>\n"
        text += f"{case['subtitle']}\n"
        
        if case["free"]:
            text += f"📊 Осталось сегодня: {left}/{case['daily_limit']}\n"
        else:
            text += f"⭐ Стоимость: {case['cost_stars']} Stars\n"
        
        text += "\n"
    
    text += "Выбери кейс для открытия:"
    
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🔵 Синий кейс (бесплатно)", callback_data="case:open:blue")],
        [InlineKeyboardButton(text="🟡 Золотой кейс (150⭐)", callback_data="case:open:gold")],
        [InlineKeyboardButton(text="⬅️ Меню", callback_data="menu:back")]
    ])
    
    await message.answer(text, reply_markup=kb)


@router.callback_query(F.data.startswith("case:open:"))
async def callback_open_case(callback, db: Database):
    case_id = callback.data.split(":")[2]
    user_id = callback.from_user.id
    
    case = CASES_CONFIG.get(case_id)
    if not case:
        await callback.answer("❌ Кейс не найден", show_alert=True)
        return
    
    # Check daily limit for free cases
    if case["free"]:
        opens_today = await db.get_case_opens_today(user_id, case_id)
        if opens_today >= case["daily_limit"]:
            await callback.answer("❌ Дневной лимит исчерпан", show_alert=True)
            return
    
    # Check stars for paid cases
    if not case["free"]:
        if not await db.spend_stars(user_id, case["cost_stars"]):
            await callback.answer("❌ Недостаточно Stars", show_alert=True)
            return
    
    # Roll item
    item = roll_item(case_id)
    if not item:
        await callback.answer("❌ Ошибка при открытии", show_alert=True)
        return
    
    # Record the open
    await db.record_case_open(user_id, case_id, item["key"])
    
    # Add to inventory
    await db.add_to_inventory(
        user_id,
        item["key"],
        item["name"],
        item["rarity"],
        item["sell"],
        item.get("grants_premium", False)
    )
    
    # Grant premium if item grants it
    if item.get("grants_premium"):
        await db.set_pro_status(user_id, days=1)
    
    rarity_emoji = RARITY_EMOJI.get(item["rarity"], "⚪")
    text = f"🎉 <b>Выпало:</b>\n\n"
    text += f"{rarity_emoji} {item['name']}\n"
    text += f"💰 Продажа: {item['sell']} монет\n"
    
    if item.get("grants_premium"):
        text += f"⭐ +1 день премиума!\n"
    
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🔄 Открыть ещё", callback_data=f"case:open:{case_id}")],
        [InlineKeyboardButton(text="📦 Инвентарь", callback_data="inventory:view")],
        [InlineKeyboardButton(text="⬅️ Меню", callback_data="menu:back")]
    ])
    
    await callback.message.edit_text(text, reply_markup=kb)
    await callback.answer()


@router.message(F.text == "📦 Инвентарь")
async def cmd_inventory(message: Message, db: Database):
    user_id = message.from_user.id
    inventory = await db.get_inventory(user_id)
    
    if not inventory:
        text = "📦 <b>Твой инвентарь пуст</b>\n\n"
        text += "Открой кейс, чтобы получить предметы!"
        kb = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="🎁 Открыть кейс", callback_data="case:open:blue")],
            [InlineKeyboardButton(text="⬅️ Меню", callback_data="menu:back")]
        ])
    else:
        text = f"📦 <b>Твой инвентарь</b> ({len(inventory)} предметов)\n\n"
        
        for item in inventory[:10]:  # Show first 10 items
            rarity_emoji = RARITY_EMOJI.get(item["item_rarity"], "⚪")
            text += f"{rarity_emoji} {item['item_name']} - 💰{item['sell_price']} монет\n"
        
        if len(inventory) > 10:
            text += f"\n... и ещё {len(inventory) - 10} предметов\n"
        
        kb = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="💰 Продать всё", callback_data="inventory:sell_all")],
            [InlineKeyboardButton(text="⬅️ Меню", callback_data="menu:back")]
        ])
    
    await message.answer(text, reply_markup=kb)


@router.callback_query(F.data == "inventory:view")
async def callback_inventory_view(callback, db: Database):
    user_id = callback.from_user.id
    inventory = await db.get_inventory(user_id)
    
    if not inventory:
        text = "📦 <b>Инвентарь пуст</b>"
    else:
        text = f"📦 <b>Инвентарь</b> ({len(inventory)} предметов)\n\n"
        for item in inventory[:10]:
            rarity_emoji = RARITY_EMOJI.get(item["item_rarity"], "⚪")
            text += f"{rarity_emoji} {item['item_name']} - 💰{item['sell_price']} монет\n"
    
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="⬅️ Меню", callback_data="menu:back")]
    ])
    
    await callback.message.edit_text(text, reply_markup=kb)
    await callback.answer()


@router.callback_query(F.data == "inventory:sell_all")
async def callback_sell_all(callback, db: Database):
    user_id = callback.from_user.id
    inventory = await db.get_inventory(user_id)
    
    if not inventory:
        await callback.answer("❌ Инвентарь пуст", show_alert=True)
        return
    
    total_coins = sum(item["sell_price"] for item in inventory)
    
    # Sell all items
    for item in inventory:
        await db.remove_from_inventory(item["id"], user_id)
    
    await db.add_coins(user_id, total_coins)
    
    text = f"💰 <b>Продано {len(inventory)} предметов</b>\n\n"
    text += f"💵 Получено: {total_coins} монет Nexus"
    
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="💰 Баланс", callback_data="balance:view")],
        [InlineKeyboardButton(text="⬅️ Меню", callback_data="menu:back")]
    ])
    
    await callback.message.edit_text(text, reply_markup=kb)
    await callback.answer()


@router.message(F.text == "💰 Баланс")
async def cmd_balance(message: Message, db: Database):
    user_id = message.from_user.id
    currency = await db.get_currency(user_id)
    
    text = "💰 <b>Твой баланс</b>\n\n"
    text += f"⭐ Telegram Stars: {currency['stars']}\n"
    text += f"💎 Nexus Coins: {currency['coins']}\n"
    text += f"🏆 Очки: {currency['points']}\n\n"
    text += "💡 Stars покупаются в Telegram\n"
    text += "💎 Coins зарабатывай в кейсах и квестах"
    
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🎁 Открыть кейс", callback_data="case:open:blue")],
        [InlineKeyboardButton(text="📋 Задания", callback_data="quests:view")],
        [InlineKeyboardButton(text="⬅️ Меню", callback_data="menu:back")]
    ])
    
    await message.answer(text, reply_markup=kb)


@router.callback_query(F.data == "balance:view")
async def callback_balance_view(callback, db: Database):
    user_id = callback.from_user.id
    currency = await db.get_currency(user_id)
    
    text = "💰 <b>Баланс</b>\n\n"
    text += f"⭐ Stars: {currency['stars']}\n"
    text += f"💎 Coins: {currency['coins']}\n"
    text += f"🏆 Points: {currency['points']}"
    
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="⬅️ Меню", callback_data="menu:back")]
    ])
    
    await callback.message.edit_text(text, reply_markup=kb)
    await callback.answer()


# Quests configuration
QUESTS_CONFIG = [
    {"id": "a1", "game": "CS:GO", "title": "Разминка на 35 минут", "desc": "Сыграй 35 минут в CS:GO", "minutes": 35, "points": 100, "coins": 15},
    {"id": "a2", "game": "War Thunder", "title": "Танковый экипаж", "desc": "Сыграй 60 минут в War Thunder", "minutes": 60, "points": 150, "coins": 35},
    {"id": "a3", "game": "Roblox", "title": "Соседи по Brookhaven", "desc": "Сыграй 120 минут в Roblox", "minutes": 120, "points": 220, "coins": 65},
]


@router.message(F.text == "📋 Задания")
async def cmd_quests(message: Message, db: Database):
    user_id = message.from_user.id
    progress = await db.get_all_quests_progress(user_id)
    progress_map = {p["quest_id"]: p for p in progress}
    
    text = "📋 <b>Активные задания</b>\n\n"
    
    for quest in QUESTS_CONFIG:
        prog = progress_map.get(quest["id"])
        current_minutes = prog["progress_minutes"] if prog else 0
        completed = prog["completed"] if prog else False
        percent = min(100, int(current_minutes / quest["minutes"] * 100))
        
        status = "✅" if completed else "🔄"
        text += f"{status} <b>{quest['title']}</b>\n"
        text += f"📊 Прогресс: {current_minutes}/{quest['minutes']} мин ({percent}%)\n"
        text += f"🎁 Награда: {quest['coins']}💎 + {quest['points']}🏆\n\n"
    
    text += "💡 Время в игре начисляется автоматически"
    
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="💰 Баланс", callback_data="balance:view")],
        [InlineKeyboardButton(text="⬅️ Меню", callback_data="menu:back")]
    ])
    
    await message.answer(text, reply_markup=kb)


@router.callback_query(F.data == "quests:view")
async def callback_quests_view(callback, db: Database):
    user_id = callback.from_user.id
    progress = await db.get_all_quests_progress(user_id)
    progress_map = {p["quest_id"]: p for p in progress}
    
    text = "📋 <b>Задания</b>\n\n"
    
    for quest in QUESTS_CONFIG:
        prog = progress_map.get(quest["id"])
        current_minutes = prog["progress_minutes"] if prog else 0
        completed = prog["completed"] if prog else False
        percent = min(100, int(current_minutes / quest["minutes"] * 100))
        
        status = "✅" if completed else "🔄"
        text += f"{status} {quest['title']} - {percent}%\n"
    
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="⬅️ Меню", callback_data="menu:back")]
    ])
    
    await callback.message.edit_text(text, reply_markup=kb)
    await callback.answer()


@router.callback_query(F.data == "menu:back")
async def callback_menu_back(callback):
    await callback.message.delete()
    await callback.answer()
