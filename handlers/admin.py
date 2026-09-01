from datetime import datetime

from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

from config import Settings
from database import Database

router = Router()


@router.message(Command("stats"))
async def admin_stats(message: Message, db: Database, settings: Settings):
    if message.from_user.id not in settings.admin_ids:
        return

    s = await db.stats()
    await message.answer(
        "📊 <b>Статистика TeamFinder</b>\n\n"
        f"👥 Пользователей: {s['users']}\n"
        f"📝 Анкет: {s['profiles']}\n"
        f"💳 Покупок: {s['purchases']}\n"
        f"⭐ Stars заработано: {s['stars']}"
    )


@router.message(Command("donatevidacha"))
async def admin_donate(message: Message, db: Database, settings: Settings):
    if message.from_user.id not in settings.admin_ids:
        return

    args = message.text.strip().split()
    if len(args) < 4:
        await message.answer(
            "❌ <b>Неверный формат</b>\n\n"
            "Использование:\n"
            "<code>/donatevidacha &lt;user_id&gt; &lt;coins&gt; &lt;stars&gt;</code>\n\n"
            "Пример:\n"
            "<code>/donatevidacha 123456789 1000 50</code>"
        )
        return

    try:
        target_id = int(args[1])
        coins = int(args[2])
        stars = int(args[3])
    except ValueError:
        await message.answer("❌ <b>Ошибка:</b> user_id, coins и stars должны быть числами.")
        return

    if coins < 0 or stars < 0:
        await message.answer("❌ <b>Ошибка:</b> значения не могут быть отрицательными.")
        return

    if coins > 0:
        await db.adjust_currency(target_id, coins=coins)
    if stars > 0:
        await db.adjust_currency(target_id, stars=stars)

    await db.audit_log(message.from_user.id, "admin_donate", f"target={target_id} coins=+{coins} stars=+{stars}")

    await message.answer(
        "✅ <b>Выдача выполнена!</b>\n\n"
        f"👤 Пользователь: <code>{target_id}</code>\n"
        f"🪙 Nexus Coin: <b>+{coins}</b>\n"
        f"⭐ Nexus Stars: <b>+{stars}</b>"
    )


@router.message(Command("donatedelete"))
async def admin_donate_delete(message: Message, db: Database, settings: Settings):
    if message.from_user.id not in settings.admin_ids:
        return

    args = message.text.strip().split()
    if len(args) < 4:
        await message.answer(
            "❌ <b>Неверный формат</b>\n\n"
            "Использование:\n"
            "<code>/donatedelete &lt;user_id&gt; &lt;coins&gt; &lt;stars&gt;</code>\n\n"
            "Пример:\n"
            "<code>/donatedelete 123456789 500 30</code>"
        )
        return

    try:
        target_id = int(args[1])
        coins = int(args[2])
        stars = int(args[3])
    except ValueError:
        await message.answer("❌ <b>Ошибка:</b> user_id, coins и stars должны быть числами.")
        return

    if coins < 0 or stars < 0:
        await message.answer("❌ <b>Ошибка:</b> значения не могут быть отрицательными.")
        return

    removed_coins = 0
    removed_stars = 0
    async with db.pool.acquire() as conn:
        async with conn.transaction():
            if coins > 0:
                row = await conn.fetchrow(
                    "SELECT coins FROM user_currency WHERE user_id = $1 FOR UPDATE",
                    target_id,
                )
                current_coins = row["coins"] if row else 0
                removed_coins = min(coins, current_coins)
                await conn.execute(
                    "UPDATE user_currency SET coins = GREATEST(0, coins - $1), updated_at = $2 WHERE user_id = $3",
                    coins, datetime.utcnow().isoformat(), target_id,
                )
            if stars > 0:
                row = await conn.fetchrow(
                    "SELECT stars FROM user_currency WHERE user_id = $1 FOR UPDATE",
                    target_id,
                )
                current_stars = row["stars"] if row else 0
                removed_stars = min(stars, current_stars)
                await conn.execute(
                    "UPDATE user_currency SET stars = GREATEST(0, stars - $1), updated_at = $2 WHERE user_id = $3",
                    stars, datetime.utcnow().isoformat(), target_id,
                )

    await db.audit_log(message.from_user.id, "admin_donate_delete", f"target={target_id} coins=-{removed_coins} stars=-{removed_stars}")

    await message.answer(
        "✅ <b>Удаление выполнено!</b>\n\n"
        f"👤 Пользователь: <code>{target_id}</code>\n"
        f"🪙 Nexus Coin: <b>-{removed_coins}</b>\n"
        f"⭐ Nexus Stars: <b>-{removed_stars}</b>"
    )


@router.message(Command("giveitem"))
async def admin_give_item(message: Message, db: Database, settings: Settings):
    if message.from_user.id not in settings.admin_ids:
        return

    args = message.text.strip().split()
    if len(args) < 3:
        await message.answer(
            "❌ <b>Неверный формат</b>\n\n"
            "Использование:\n"
            "<code>/giveitem <user_id> <item_key> [count]</code>\n\n"
            "Примеры:\n"
            "<code>/giveitem 123456789 f16 1</code>\n"
            "<code>/giveitem 123456789 ak47 5</code>\n\n"
            "Популярные item_key:\n"
            "<code>f16, f15, f14, ak47, premium-card, premium-card-lite, premium-medium, "
            "stars-150, stars-400, stars-1200, nexus-model, icon-skull, icon-fire, "
            "icon-crown, icon-target, icon-bolt, icon-star</code>"
        )
        return

    try:
        target_id = int(args[1])
        item_key = args[2]
        count = int(args[3]) if len(args) > 3 else 1
    except ValueError:
        await message.answer("❌ <b>Ошибка:</b> user_id и count должны быть числами.")
        return

    if count < 1 or count > 100:
        await message.answer("❌ <b>Ошибка:</b> count должен быть от 1 до 100.")
        return

    # Define item metadata (key -> name, rarity, sell_price, grants_premium)
    ITEMS = {
        "f16": ("F-16 Fighting Falcon", "legendary", 0, False),
        "f15": ("F-15 Eagle", "epic", 0, False),
        "f14": ("F-14 Tomcat", "legendary", 0, False),
        "ak47": ("AK-47", "rare", 15, False),
        "premium-card": ("Premium Card", "premium", 100, True),
        "premium-card-lite": ("Premium Card Lite", "epic", 45, True),
        "premium-medium": ("Premium 4 дня", "epic", 35, True),
        "stars-150": ("150 Stars", "common", 0, False),
        "stars-400": ("400 Stars", "rare", 0, False),
        "stars-1200": ("1200 Stars", "epic", 0, False),
        "nexus-model": ("Mini Boss bro", "legendary", 55000, False),
        "icon-skull": ("Skull Icon", "common", 10, False),
        "icon-fire": ("Fire Icon", "common", 10, False),
        "icon-crown": ("Crown Icon", "common", 10, False),
        "icon-target": ("Target Icon", "common", 10, False),
        "icon-bolt": ("Bolt Icon", "common", 10, False),
        "icon-star": ("Star Icon", "common", 10, False),
    }

    if item_key not in ITEMS:
        await message.answer(
            f"❌ <b>Неизвестный item_key:</b> <code>{item_key}</code>\n\n"
            "Доступные: " + ", ".join(f"<code>{k}</code>" for k in ITEMS.keys())
        )
        return

    name, rarity, sell, grants_premium = ITEMS[item_key]

    for _ in range(count):
        await db.add_to_inventory(target_id, item_key, name, rarity, sell, grants_premium)

    await db.audit_log(message.from_user.id, "admin_give_item", f"target={target_id} item={item_key} count={count}")

    await message.answer(
        "✅ <b>Предмет выдан!</b>\n\n"
        f"👤 Пользователь: <code>{target_id}</code>\n"
        f"🎁 Предмет: <b>{name}</b> (<code>{item_key}</code>)\n"
        f"🔢 Количество: <b>{count}</b>\n"
        f"🎨 Редкость: <b>{rarity}</b>"
    )
