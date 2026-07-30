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
